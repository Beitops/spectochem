# SpectoChem visualizer

An interactive React/Vite frontend for exploring predicted UV–Vis–NIR spectra and rotating 3D molecular structures. The included database contains 2,112 compounds, three 5,000-point spectrum tracks per compound, on-demand RDKit MolBlocks, formulas, SMILES, wavelength bounds, and JSD metrics.

## Run the website

```bash
npm install
npm run dev
```

Create the production build with `npm run build` and preview it with `npm run preview`.

## Regenerate frontend data

The repaired exporter is self-contained; it no longer imports private `gjepa` training helpers and no longer stops after the first molecule. Install its dependencies in a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
python scripts/export_spectra.py --project-root /path/to/training/repository
```

The training repository must contain:

- `data/experiments/supervised/<seed>/…` prediction CSVs for SchNet and GAT
- `data/datasets/TMQM_SPECTO/raw/uvvis_final_40k.csv`
- `data/datasets/TMQM_SPECTO/raw/tmqmg_star.csv`

Output is written to `public/data` by default. Each `.bin` file contains three sequential little-endian float32 arrays: ground truth, SchNet, and GAT.

## Frontend structure

- `src/components` — spectrum canvas, wavelength band and beam, 3D viewer, database, dialogs
- `src/hooks` — metadata and binary spectrum loading
- `src/lib/spectra.js` — binary decoding, wavelength conversion, PDF normalization
- `src/variables.css` — shared visual tokens
- `scripts/export_spectra.py` — repaired Python export pipeline
