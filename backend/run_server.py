"""Script de lancement du serveur"""
import os
import sys

# Se placer dans le dossier backend
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("  Chat'Maths Burkina Faso v1.0")
    print("  Serveur API - http://127.0.0.1:8000")
    print("=" * 50)
    print()
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        log_level="info"
    )