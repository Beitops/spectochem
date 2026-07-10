import os
import sys
import re
import io
import json
import argparse
import glob
from pathlib import Path
from typing import Any, Optional, Dict, Tuple, List

import numpy as np
import pandas as pd
from tqdm import tqdm, trange

from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem import rdCoordGen
from rdkit.Chem.Draw import rdMolDraw2D
from rdkit.Chem.rdMolDescriptors import CalcMolFormula

MODEL_COLORS = {
    "SchNet": "#FF8F00",        
    "GAT": "#B0BEC5"           
}


TARGET_MODELS = {
    "GAT": "gat",
    "SchNet": "schnet",
}

POINTS_PER_TRACK = 5000
GAUSSIAN_SIGMA_EV = 0.25


def get_smoothed_spectrum(
    transitions: np.ndarray,
    oscillator_strengths: np.ndarray,
    x_min: float = 0.0,
    x_max: float = 12.0,
    n_points: int = POINTS_PER_TRACK,
    sigma: float = GAUSSIAN_SIGMA_EV,
) -> Tuple[np.ndarray, np.ndarray]:
    """Broaden discrete excitation energies onto a regular energy grid.

    This local implementation replaces the private training-repository helper used
    by the original script, so the export pipeline is runnable on its own.
    """
    grid = np.linspace(x_min, x_max, n_points, dtype=np.float64)
    energies = np.asarray(transitions, dtype=np.float64).reshape(-1, 1)
    strengths = np.asarray(oscillator_strengths, dtype=np.float64).reshape(-1, 1)
    spectrum = np.sum(strengths * np.exp(-0.5 * ((grid[None, :] - energies) / sigma) ** 2), axis=0)
    return grid.astype(np.float32), spectrum.astype(np.float32)


def normalized_jsd(predicted: np.ndarray, target: np.ndarray) -> np.ndarray:
    """Return the Jensen–Shannon divergence for each pair of spectra."""
    eps = np.finfo(np.float64).eps
    predicted = np.asarray(predicted, dtype=np.float64)
    target = np.asarray(target, dtype=np.float64)
    predicted /= np.maximum(predicted.sum(axis=1, keepdims=True), eps)
    target /= np.maximum(target.sum(axis=1, keepdims=True), eps)
    mixture = 0.5 * (predicted + target)
    kl_pred = np.sum(np.where(predicted > 0, predicted * np.log((predicted + eps) / (mixture + eps)), 0.0), axis=1)
    kl_target = np.sum(np.where(target > 0, target * np.log((target + eps) / (mixture + eps)), 0.0), axis=1)
    return (0.5 * (kl_pred + kl_target)).astype(np.float32)

# ==========================================
# CORE FORMULA & MOLECULE HELPERS
# ==========================================
def parse_formulas(raw_formula: str) -> Tuple[str, str]:
    """Parses raw formulas into safe ASCII representation and clean Unicode subscripts."""
    subscript_map = str.maketrans("0123456789", "₀₁₂₃₄₅₆₇₈₉")
    ascii_formula = raw_formula
    unicode_formula = raw_formula.translate(subscript_map)
    return ascii_formula, unicode_formula

def build_molecule_object(row: pd.Series, csd_code: str) -> Tuple[Chem.Mol, str, str, str, str]:
    """Builds a verified RDKit molecule object, extracting ASCII, Unicode formulas, SMILES, and 3D MolBlock."""
    smiles_col = 'smiles' if 'smiles' in row else 'SMILES'
    if smiles_col not in row:
        raise ValueError(f"SMILES data missing for {csd_code}")
        
    smiles_str = row[smiles_col]
    raw_mol = Chem.MolFromSmiles(smiles_str)
    if raw_mol is None:
        raise ValueError(f"RDKit failed parsing SMILES for {csd_code}")

    # 1. Add Hydrogens (Crucial for proper 3D geometry)
    raw_mol = Chem.AddHs(raw_mol)

    # 2. Embed the molecule in 3D space
    AllChem.EmbedMolecule(raw_mol, randomSeed=42)

    # 3. Optional but recommended: Optimize the structure (clean up the bond lengths/angles)
    #AllChem.MMFFOptimizeMolecule(raw_mol)
    
    # Generate standard MolBlock using the newly attached 3D conformer
    molblock = Chem.MolToMolBlock(raw_mol)
    
    ascii_f, uni_f = parse_formulas(CalcMolFormula(raw_mol))
    return raw_mol, ascii_f, uni_f, smiles_str, molblock

def save_molecule_vector_svg(mol: Chem.Mol, output_path: Path):
    """Draws and exports clean, high-resolution standalone molecule SVGs."""
    draw_mol = Chem.RemoveHs(mol)
    draw_mol.RemoveAllConformers() # Clear 3D conformer to avoid warping the 2D draw
    rdCoordGen.AddCoords(draw_mol)
    
    d2d = rdMolDraw2D.MolDraw2DSVG(400, 400)
    opts = d2d.drawOptions()
    opts.clearBackground = False
    opts.bondLineWidth = 4.0
    opts.minFontSize = 14
    
    d2d.DrawMolecule(draw_mol)
    d2d.FinishDrawing()
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        f.write(d2d.GetDrawingText())

# ==========================================
# PIPELINE STEP MODULES
# ==========================================
def load_predictions(base_dir: Path, seed: int) -> Tuple[Dict[str, Dict], np.ndarray]:
    preds = {}
    all_origin_ids = None
    
    for label, f_name in TARGET_MODELS.items():
        valid_model = True
        f_true_mat, f_pred_mat = [], []
        l_true_mat, l_pred_mat = [], []

        for state in range(10):
            dir_f = base_dir / "f_regressor" / str(state) / f_name
            dir_l = base_dir / "lambda_regressor" / str(state) / f_name

            csv_f = dir_f / f"std-False/norm_to_eV-False_f-as-log10-True/block_3_null/results/lightning_logs/version_{seed}/test_predictions_wide.csv"
            csv_l = dir_l / f"std-False/norm_to_eV-True_f-as-log10-False/block_3_null/results/lightning_logs/version_{seed}/test_predictions_wide.csv"

            if not csv_f.exists() or not csv_l.exists():
                valid_model = False
                break

            df_f = pd.read_csv(csv_f)
            df_l = pd.read_csv(csv_l)

            if all_origin_ids is None: 
                all_origin_ids = df_f['origin_id'].values

            t_col_f = [c for c in df_f.columns if c.startswith('target')][0]
            p_col_f = [c for c in df_f.columns if c.startswith('prediction')][0]
            t_col_l = [c for c in df_l.columns if c.startswith('target')][0]
            p_col_l = [c for c in df_l.columns if c.startswith('prediction')][0]

            f_true_mat.append(df_f[t_col_f].values)
            f_pred_mat.append(df_f[p_col_f].values)
            l_true_mat.append(df_l[t_col_l].values)
            l_pred_mat.append(df_l[p_col_l].values)

        if valid_model:
            preds[label] = {
                'f_true': np.array(f_true_mat).T, 'f_pred': np.array(f_pred_mat).T,
                'l_true': np.array(l_true_mat).T, 'l_pred': np.array(l_pred_mat).T
            }
            
    if all_origin_ids is None:
        raise FileNotFoundError("Could not read matching dataset arrays across targets.")
    return preds, all_origin_ids

def calculate_metrics(preds: Dict[str, Dict], total_samples: int) -> Dict[str, np.ndarray]:
    jsd_store = {}
    for m_name, m_data in preds.items():
        t_specs, p_specs = [], []
        for i in trange(total_samples, desc=f"Smoothing {m_name}"):
            _, t_spec = get_smoothed_spectrum(m_data['l_true'][i], 10**m_data['f_true'][i])
            _, p_spec = get_smoothed_spectrum(m_data['l_pred'][i], 10**m_data['f_pred'][i])
            t_specs.append(t_spec)
            p_specs.append(p_spec)

        jsd_store[m_name] = normalized_jsd(np.asarray(p_specs), np.asarray(t_specs))
    return jsd_store

# ==========================================
# PATHWAY EXECUTIONS
# ==========================================
def process_all_molecules(preds: Dict[str, Dict], jsd_store: Dict[str, np.ndarray], origin_ids: np.ndarray, df_full: pd.DataFrame, output_dir: Path):
    """Pathway 1: Creates raw high-density float32 individual binary matrices for frontend fetch calls."""
    print("\nProcessing Pathway 1: Exporting 5k vectors to streamlined individual binary assets...")
    mol_dir = output_dir / "molecules"
    spec_dir = output_dir / "spectrums"
    mol_dir.mkdir(parents=True, exist_ok=True)
    spec_dir.mkdir(parents=True, exist_ok=True)

    metadata = {}
    ordered_models = ["SchNet", "GAT"]
    missing_models = [model for model in ordered_models if model not in preds]
    if missing_models:
        raise RuntimeError(f"Required prediction tracks are missing: {', '.join(missing_models)}")
    
    for idx, csd_code in enumerate(tqdm(origin_ids, desc="Generating Binary Pipelines")):
        row_data = df_full[df_full['CSD_code'] == csd_code]
        if row_data.empty: continue
        row = row_data.iloc[0]

        try:
            raw_mol, ascii_formula, unicode_formula, smiles_str, molblock = build_molecule_object(row, csd_code)
        except Exception:
            continue

        try:
            save_molecule_vector_svg(raw_mol, mol_dir / f"{csd_code}.svg")
        except Exception:
            pass

        local_preds = {m: (m_data['l_pred'][idx], m_data['f_pred'][idx]) for m, m_data in preds.items()}
        local_jsds = {m: float(jsd_store[m][idx]) for m in preds.keys()}
        
        # Calculate bounds dynamically
        l_true = preds[list(preds.keys())[0]]['l_true'][idx]
        f_true = preds[list(preds.keys())[0]]['f_true'][idx]
        all_l_vals = [l_true] + [l_p for l_p, _ in local_preds.values()]
        
        x_min = max(0.1, min(np.min(l) for l in all_l_vals) - 2.0) 
        x_max = max(np.max(l) for l in all_l_vals) + 2.0

        # Generate Ground Truth 5k intensity distribution
        _, t_spec = get_smoothed_spectrum(l_true, 10**f_true, x_min=x_min, x_max=x_max, n_points=5000)
        
        # Pack three 5000-point tracks sequentially: ground truth, SchNet, GAT.
        binary_payload = bytearray()
        binary_payload.extend(t_spec.astype(np.float32).tobytes())

        for m_name in ordered_models:
            l_pred, f_pred = local_preds[m_name]
            _, p_spec = get_smoothed_spectrum(l_pred, 10**f_pred, x_min=x_min, x_max=x_max, n_points=5000)
            binary_payload.extend(p_spec.astype(np.float32).tobytes())

        # Each file is exactly 60,000 bytes: 3 tracks * 5000 pts * float32.
        with open(spec_dir / f"{csd_code}.bin", "wb") as f:
            f.write(binary_payload)

        # Record bounds and identifiers inside UI global entry indexing
        metadata[csd_code] = {
            "chemical_formula": {
                "unicode": unicode_formula,
                "ascii": ascii_formula
            },
            "smiles": smiles_str,
            "molblock": molblock,
            "x_min": float(x_min),
            "x_max": float(x_max),
            "jsd": local_jsds
        }

    with open(output_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=4)
        
    print(f"Pathway 1 complete. High-speed binary tracks written inside {spec_dir}/")

# ==========================================
# MAIN ROUTINE EXECUTION
# ==========================================
def main():
    parser = argparse.ArgumentParser(description="Multi-Pathway Spectra Visualization Engine")
    parser.add_argument("--seed", type=int, default=2137, help="Target experiment validation seed")
    parser.add_argument("--project-root", type=Path, default=Path.cwd(), help="Training repository containing data/experiments and data/datasets")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "public" / "data", help="Frontend data output directory")
    args = parser.parse_args()

    project_root = args.project_root.resolve()
    BASE_DIR = project_root / "data" / "experiments" / "supervised" / str(args.seed)
    OUTPUT_BASE = args.output.resolve()
    OUTPUT_BASE.mkdir(parents=True, exist_ok=True)
    
    print(f"Loading prediction arrays from {BASE_DIR}...")
    preds, origin_ids = load_predictions(BASE_DIR, args.seed)
    jsd_store = calculate_metrics(preds, len(origin_ids))

    print("Loading data reference tables...")
    dataset_root = project_root / "data" / "datasets" / "TMQM_SPECTO" / "raw"
    df_base = pd.read_csv(dataset_root / "uvvis_final_40k.csv")
    df_star = pd.read_csv(dataset_root / "tmqmg_star.csv")
    df_full = pd.merge(df_base, df_star, how="inner", left_on="CSD_code", right_on="id")

    process_all_molecules(preds, jsd_store, origin_ids, df_full, OUTPUT_BASE)
        
if __name__ == "__main__":
    main()
