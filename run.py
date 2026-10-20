#!/usr/bin/env python
"""
Lanceur unique du Chatbot Mathématiques Burkina Faso.
Démarre le backend FastAPI ET le frontend Vite, attend qu'ils soient réellement
prêts (pas juste "processus lancé"), puis ouvre le navigateur automatiquement.

Utilisation : python run.py   (ou "Run Python File" dans VS Code)
Arrêt       : Ctrl+C
"""

import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

try:
    sys.stdout.reconfigure(line_buffering=True)
except AttributeError:
    pass  # Python < 3.7, ignorable

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"
BACKEND_URL = "http://127.0.0.1:8000"
FRONTEND_URL = "http://localhost:5173"


class C:
    BLUE = "\033[94m"
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    WARNING = "\033[93m"
    FAIL = "\033[91m"
    END = "\033[0m"
    BOLD = "\033[1m"


def enable_ansi_on_windows():
    if os.name == "nt":
        os.system("")  # active l'interprétation des couleurs ANSI dans cmd/PowerShell


def banner():
    print(f"""{C.CYAN}{C.BOLD}
==============================================================
   Chat'Maths Burkina Faso
   Assistant intelligent en mathematiques (6eme -> Terminale)
=============================================================={C.END}
""")


def find_backend_python() -> str:
    """Utilise le venv du backend s'il existe (déjà configuré avec les bonnes
    dépendances) ; sinon retombe sur l'interpréteur courant."""
    if os.name == "nt":
        venv_python = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
    else:
        venv_python = BACKEND_DIR / "venv" / "bin" / "python"

    if venv_python.exists():
        return str(venv_python)

    print(f"{C.WARNING}[ATTENTION] Aucun venv trouvé dans backend/venv, utilisation de {sys.executable}{C.END}")
    return sys.executable


def ensure_backend_dependencies(python_exe: str):
    check = subprocess.run(
        [python_exe, "-c", "import fastapi, uvicorn, anthropic"],
        cwd=str(BACKEND_DIR),
        capture_output=True,
    )
    if check.returncode == 0:
        print(f"{C.GREEN}[OK] Dépendances backend déjà installées{C.END}")
        return

    print(f"{C.BLUE}[INFO] Installation des dépendances backend (peut prendre quelques minutes)...{C.END}")
    result = subprocess.run(
        [python_exe, "-m", "pip", "install", "-r", "requirements.txt"],
        cwd=str(BACKEND_DIR),
    )
    if result.returncode != 0:
        print(f"{C.FAIL}[ERREUR] Échec de l'installation des dépendances backend.{C.END}")
        sys.exit(1)
    print(f"{C.GREEN}[OK] Dépendances backend installées{C.END}")


def ensure_env_file():
    env_file = BACKEND_DIR / ".env"
    example_file = BACKEND_DIR / ".env.example"
    if not env_file.exists() and example_file.exists():
        shutil.copy(example_file, env_file)
        print(f"{C.WARNING}[ATTENTION] backend/.env créé à partir de .env.example.{C.END}")
        print(f"{C.WARNING}            Ajoute ta clé ANTHROPIC_API_KEY dedans pour activer les réponses IA "
              f"(un mode local dégradé fonctionne déjà sans clé).{C.END}")


def ensure_data_dirs():
    for d in ("data/documents", "data/chroma_db"):
        (BACKEND_DIR / d).mkdir(parents=True, exist_ok=True)


def npm_command() -> str:
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        print(f"{C.FAIL}[ERREUR] npm est introuvable dans le PATH. Installe Node.js : https://nodejs.org{C.END}")
        sys.exit(1)
    return npm


def ensure_frontend_dependencies(npm: str):
    if (FRONTEND_DIR / "node_modules").exists():
        print(f"{C.GREEN}[OK] Dépendances frontend déjà installées{C.END}")
        return

    print(f"{C.BLUE}[INFO] Installation des dépendances frontend (npm install, peut prendre quelques minutes)...{C.END}")
    result = subprocess.run([npm, "install"], cwd=str(FRONTEND_DIR))
    if result.returncode != 0:
        print(f"{C.FAIL}[ERREUR] Échec de 'npm install'.{C.END}")
        sys.exit(1)
    print(f"{C.GREEN}[OK] Dépendances frontend installées{C.END}")


def stream_output(process: subprocess.Popen, prefix: str, color: str):
    try:
        for line in process.stdout:
            print(f"{color}[{prefix}]{C.END} {line}", end="")
    except (ValueError, OSError):
        pass  # flux fermé car le process s'est arrêté


def wait_until_ready(url: str, label: str, timeout: int, process: subprocess.Popen) -> bool:
    print(f"{C.BLUE}[INFO] Attente de {label} sur {url} ...{C.END}")
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            print(f"{C.FAIL}[ERREUR] {label} s'est arrêté prématurément (code {process.returncode}). "
                  f"Regarde les logs ci-dessus pour la cause.{C.END}")
            return False
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status < 500:
                    print(f"{C.GREEN}[OK] {label} est prêt !{C.END}")
                    return True
        except (urllib.error.URLError, ConnectionResetError, TimeoutError):
            pass
        time.sleep(1)

    print(f"{C.FAIL}[ERREUR] {label} n'a pas répondu après {timeout}s.{C.END}")
    return False


def is_already_running(url: str) -> bool:
    """Vérifie si un serveur répond déjà à cette URL (ex : un lancement précédent
    jamais arrêté). Évite d'échouer bêtement sur un port occupé : on réutilise
    le serveur existant plutôt que de planter dessus."""
    try:
        with urllib.request.urlopen(url, timeout=2) as resp:
            return resp.status < 500
    except Exception:
        return False


def start_backend(python_exe: str) -> subprocess.Popen:
    print(f"\n{C.BOLD}Démarrage du backend...{C.END}")
    env = {**os.environ, "PYTHONUNBUFFERED": "1", "PYTHONIOENCODING": "utf-8"}
    return subprocess.Popen(
        [python_exe, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(BACKEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=env,
    )


def start_frontend(npm: str) -> subprocess.Popen:
    print(f"\n{C.BOLD}Démarrage du frontend...{C.END}")
    return subprocess.Popen(
        [npm, "run", "dev"],
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )


def main():
    enable_ansi_on_windows()
    banner()

    if sys.version_info < (3, 9):
        print(f"{C.FAIL}[ERREUR] Python 3.9+ requis (version actuelle {sys.version}).{C.END}")
        sys.exit(1)

    python_exe = find_backend_python()
    ensure_backend_dependencies(python_exe)
    ensure_env_file()
    ensure_data_dirs()

    npm = npm_command()
    ensure_frontend_dependencies(npm)

    backend_process = None
    if is_already_running(f"{BACKEND_URL}/api/health"):
        print(f"{C.GREEN}[OK] Un backend répond déjà sur {BACKEND_URL} (lancement précédent) — réutilisation.{C.END}")
        print(f"{C.WARNING}      Si tu as modifié du code backend depuis ce lancement précédent, ce serveur "
              f"tourne encore avec l'ancien code : ferme-le (Ctrl+C dans sa fenêtre, ou arrête le processus "
              f"python sur le port 8000) puis relance.{C.END}")
    else:
        backend_process = start_backend(python_exe)
        threading.Thread(target=stream_output, args=(backend_process, "Backend", C.CYAN), daemon=True).start()
        if not wait_until_ready(f"{BACKEND_URL}/api/health", "Backend", timeout=90, process=backend_process):
            print(f"{C.WARNING}Astuce : si le message ci-dessus parle d'un port déjà utilisé, un ancien "
                  f"lancement tourne peut-être encore — ferme les anciennes fenêtres/terminaux puis réessaie.{C.END}")
            backend_process.terminate()
            sys.exit(1)

    frontend_process = None
    if is_already_running(FRONTEND_URL):
        print(f"{C.GREEN}[OK] Un frontend répond déjà sur {FRONTEND_URL} (lancement précédent) — réutilisation.{C.END}")
    else:
        frontend_process = start_frontend(npm)
        threading.Thread(target=stream_output, args=(frontend_process, "Frontend", C.WARNING), daemon=True).start()
        if not wait_until_ready(FRONTEND_URL, "Frontend", timeout=60, process=frontend_process):
            if backend_process:
                backend_process.terminate()
            frontend_process.terminate()
            sys.exit(1)

    print(f"\n{C.GREEN}{C.BOLD}Tout est prêt !{C.END}")
    print(f"{C.GREEN}  Application : {C.BOLD}{FRONTEND_URL}{C.END}")
    print(f"{C.GREEN}  API backend : {C.BOLD}{BACKEND_URL}{C.END}  (doc: {BACKEND_URL}/docs){C.END}")
    print(f"{C.CYAN}Ctrl+C pour tout arrêter proprement.{C.END}\n")

    try:
        webbrowser.open(FRONTEND_URL)
    except Exception:
        pass

    own_processes = [p for p in (backend_process, frontend_process) if p is not None]

    try:
        while True:
            if any(p.poll() is not None for p in own_processes):
                print(f"{C.FAIL}[ERREUR] Un des serveurs s'est arrêté de façon inattendue.{C.END}")
                break
            if not own_processes:
                # Les deux serveurs étaient déjà lancés avant nous : rien à surveiller,
                # on reste juste disponible pour Ctrl+C.
                time.sleep(3600)
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n{C.WARNING}Arrêt en cours...{C.END}")
    finally:
        for proc in own_processes:
            if proc.poll() is None:
                proc.terminate()
        for proc in own_processes:
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
        print(f"{C.GREEN}Serveurs arrêtés. À bientôt !{C.END}")


if __name__ == "__main__":
    main()
