# Entry points for the F1 race weekend briefing agent.
#
# This file dispatches; it does not decide. Every recipe is a command that
# README.md or .github/workflows/ci.yml already documents, run from the right
# directory with the pinned toolchain. When a command here disagrees with CI,
# CI is right and this file is the bug.

# Prefixes every recipe so the Node, pnpm, and Python versions pinned in
# mise.toml are used without needing mise's shell hook active. Expands to
# nothing when mise is not installed, which leaves the bare command behind.
MISE := $(shell command -v mise >/dev/null 2>&1 && echo 'mise exec --')

# Windows lays a venv out under Scripts/, POSIX under bin/. Windows also needs
# make itself (Git Bash or WSL) — it is not part of the OS.
ifeq ($(OS),Windows_NT)
VENV_BIN := .venv/Scripts
else
VENV_BIN := .venv/bin
endif

# Tools are always reached as `$(PY) -m <tool>`, never as a bare binary: no
# activation step, and no chance of silently hitting a system-wide install.
PY := $(VENV_BIN)/python

# Real files, so dependency installs re-run when a manifest changes and are
# skipped when it has not.
VENV_STAMP := backend/.venv/pyvenv.cfg
NODE_STAMP := frontend/node_modules/.modules.yaml

.DEFAULT_GOAL := help

# `backend` and `frontend` are also directory names — without .PHONY, make sees
# the directories, decides the targets are up to date, and does nothing.
.PHONY: help dev backend frontend install lint format format-check typecheck test ci clean

help: ## List available targets
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-13s\033[0m %s\n", $$1, $$2}'

# --- Dev servers ---------------------------------------------------------

dev: ## Run both servers: backend on :8000, frontend on :3000
	@$(MAKE) -j2 backend frontend

backend: $(VENV_STAMP) ## Run the FastAPI server on :8000
	@test -f backend/.env \
		|| printf 'WARNING: backend/.env is missing. Copy backend/env.example and add GOOGLE_API_KEY.\n'
	cd backend && $(PY) -m uvicorn main:app --reload --port 8000

frontend: $(NODE_STAMP) ## Run the Next.js dev server on :3000
	cd frontend && $(MISE) pnpm dev

# --- Dependencies -------------------------------------------------------

install: $(VENV_STAMP) $(NODE_STAMP) ## Install backend and frontend dependencies

$(VENV_STAMP): backend/requirements.txt backend/requirements-dev.txt
	$(MISE) python -m venv backend/.venv
	cd backend && $(PY) -m pip install --quiet --upgrade pip
	cd backend && $(PY) -m pip install -r requirements.txt -r requirements-dev.txt
	@touch $@

$(NODE_STAMP): frontend/package.json frontend/pnpm-lock.yaml
	cd frontend && $(MISE) pnpm install
	@touch $@

# --- Checks -------------------------------------------------------------

lint: $(VENV_STAMP) $(NODE_STAMP) ## Lint both platforms
	cd backend && $(PY) -m ruff check .
	cd frontend && $(MISE) pnpm lint

format: $(VENV_STAMP) $(NODE_STAMP) ## Rewrite both platforms in canonical format
	cd backend && $(PY) -m ruff format .
	cd frontend && $(MISE) pnpm format

format-check: $(VENV_STAMP) $(NODE_STAMP) ## Fail if anything is unformatted
	cd backend && $(PY) -m ruff format --check .
	cd frontend && $(MISE) pnpm format:check

typecheck: $(NODE_STAMP) ## Typecheck the frontend (tsc --noEmit)
	cd frontend && $(MISE) pnpm typecheck

test: $(VENV_STAMP) $(NODE_STAMP) ## Run both test suites
	cd backend && $(PY) -m pytest
	cd frontend && $(MISE) pnpm test

ci: lint format-check typecheck test ## Run everything CI runs, in CI's order
	cd frontend && $(MISE) pnpm build

# --- Housekeeping -------------------------------------------------------

clean: ## Remove installed dependencies and build output
	rm -rf backend/.venv frontend/node_modules frontend/.next
	rm -rf backend/.pytest_cache backend/.coverage
	find backend -type d -name __pycache__ -prune -exec rm -rf {} +
	@printf 'Left backend/cache/ in place — that is FastF1 telemetry, 30-60s to rewarm.\n'
