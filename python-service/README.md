# LabBook BKU Python Compute Service

FastAPI service for materials informatics computations that benefit from
Python's ecosystem: pymatgen, ASE, scipy, lmfit, impedance.py, MatSciBERT.

## Status

- **Round 107**: Skeleton ✅ (FastAPI + Docker + uv setup)
- **Round 107b**: Cloud Run deploy (next)
- **Round 131+**: Add pymatgen, scipy, lmfit endpoints
- **Round 148+**: Add impedance.py for EIS
- **Round 181+**: Add ASE for DFT
- **Round 128**: Add MatSciBERT for embeddings

## Tech Stack

- **Python**: 3.13
- **Framework**: FastAPI 0.115+
- **Server**: Uvicorn (single worker, Cloud Run scales by instance)
- **Package manager**: uv (10-100x faster than pip)
- **Container**: Multi-stage Docker build, slim base image
- **Deployment**: Google Cloud Run (asia-southeast1)

## Local Development

### Prerequisites

```bash
# Install uv (one-time)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install Docker (already needed for Round 107 testing)
docker --version
```

### Setup

```bash
cd python-service

# Sync dependencies (creates .venv automatically)
uv sync

# Copy env template
cp .env.example .env
# Edit .env with your local values
```

### Run locally

```bash
# Option 1: uv run (recommended)
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Option 2: Activate venv
source .venv/bin/activate  # Linux/macOS
# or .venv\Scripts\activate  # Windows
uvicorn app.main:app --reload

# Option 3: Direct
python -m app.main
```

Test endpoints:
```bash
curl http://localhost:8000/health
curl http://localhost:8000/

# With auth
curl -X POST -H "X-Service-Auth: local-test-secret-change-me" \
  http://localhost:8000/verify-auth
```

### Run in Docker (production-like)

```bash
# Build
docker build -t labbook-python-service .

# Run
docker run -p 8080:8080 \
  -e PYTHON_SERVICE_API_KEY=local-test-secret-change-me \
  labbook-python-service

# Test
curl http://localhost:8080/health
```

## API Documentation

When running with `LOG_LEVEL=DEBUG`:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

In production (LOG_LEVEL=INFO), docs disabled for security.

## Endpoints

### Round 107 (current)

- `GET /` — Service info
- `GET /health` — Health check (no auth)
- `POST /verify-auth` — Test auth (requires X-Service-Auth header)

### Round 131+ (planned)

```
POST /xrd/analyze        — pymatgen XRD pattern + JCPDS matching
POST /raman/deconvolve   — lmfit Voigt fitting
POST /uvvis/tauc         — scipy advanced Tauc
POST /pl/multi-gauss     — scipy multi-Gaussian for trions
POST /ftir/peaks         — peak detection + functional groups
POST /eis/fit-nyquist    — impedance.py equivalent circuit
POST /ms/flat-band       — Mott-Schottky linear fit
POST /ipce/calc          — IPCE/APCE calculation
POST /xps/peak-fit       — lmfit Voigt + Shirley
POST /eds/quant          — EDS quantification
POST /bet/bjh            — BET surface area + BJH
POST /tga/steps          — TGA mass loss steps
POST /dft/qe-input       — ASE QE input generator
POST /dft/parse-output   — pymatgen DFT parsers
POST /jcpds/match        — pymatgen diffraction sim
POST /cif/visualize      — pymatgen CIF → 3D
POST /embed/matscibert   — Domain embeddings
```

## Deployment (Round 107b)

```bash
# Manual deploy via gcloud
gcloud run deploy labbook-python-service \
  --source . \
  --region asia-southeast1 \
  --no-allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --timeout 60s \
  --set-secrets PYTHON_SERVICE_API_KEY=PYTHON_SERVICE_API_KEY:latest
```

## Adding Materials Informatics Libs

Round 131+ will install via:

```bash
uv sync --extra materials
```

This installs pymatgen, scipy, lmfit, ase, impedance.py, matplotlib.

⚠️ **Image size**: With materials extras, container ~1.5-2 GB.
Consider separate Docker stage or service for heavy ML models.

## See Also

- `/AI_ARCHITECTURE.md` Section 3 (Hybrid TS + Python)
- `/AI_ARCHITECTURE.md` Section 12 (Materials Informatics Libraries)
- [awesome-materials-informatics](https://github.com/tilde-lab/awesome-materials-informatics)
- [FastAPI docs](https://fastapi.tiangolo.com/)
- [uv docs](https://docs.astral.sh/uv/)
- [Cloud Run docs](https://cloud.google.com/run/docs)
