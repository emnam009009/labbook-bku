# Python Compute Service

FastAPI service for materials science computations that benefit from
Python's ecosystem (pymatgen, ASE, scipy, lmfit, impedance.py, MatSciBERT).

## Status

Round 105: Skeleton folder only. Implementation begins Round 107.

## Planned endpoints

- `/xrd/analyze` — pymatgen-based JCPDS matching, Scherrer
- `/raman/deconvolve` — lmfit Voigt fitting
- `/pl/multi-gauss` — scipy multi-Gaussian for trion analysis
- `/eis/fit-nyquist` — impedance.py equivalent circuit fitting
- `/ms/flat-band` — Mott-Schottky linear regression
- `/xps/peak-fit` — lmfit Voigt + Shirley background
- `/dft/qe-input` — ASE-based QE input generator
- `/dft/parse-output` — pymatgen.io.vasp/qe output parsing
- `/jcpds/match` — pymatgen diffraction pattern simulation
- `/cif/visualize` — pymatgen + 3D rendering
- `/embed/matscibert` — MatSciBERT domain-specific embeddings

## Deployment target

Google Cloud Run (auto-scale 0-1000, $0 idle, free tier 2M req/month).

## Local development (planned)

```bash
cd python-service
uv sync   # or pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## See also

- `/AI_ARCHITECTURE.md` Section: Hybrid TS + Python architecture
- `/docs/ai/HYBRID_ARCHITECTURE.md` (planned in Round 107)
- [awesome-materials-informatics](https://github.com/tilde-lab/awesome-materials-informatics)
