@echo off
echo ========================================
echo Chatbot Maths Burkina Faso - Setup
echo ========================================
echo.

echo [1/4] Configuration du Backend...
cd backend
python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt
echo Backend configure !
echo.

echo [2/4] Configuration des variables d'environnement...
if not exist .env (
    copy .env.example .env
    echo Fichier .env cree !
) else (
    echo Fichier .env existe deja !
)
echo.
echo NOTE: Pour de meilleures performances, ajoutez votre cle API Hugging Face dans .env
echo Obtenez une cle gratuite sur: https://huggingface.co/settings/tokens
echo.

echo [3/4] Configuration du Frontend...
cd ..\frontend
call npm install
echo Frontend configure !
echo.

echo [4/4] Creation des repertoires de donnees...
cd ..\backend
if not exist data\documents mkdir data\documents
if not exist data\chroma_db mkdir data\chroma_db
echo Repertoires crees !
echo.

echo ========================================
echo Setup termine !
echo ========================================
echo.
echo Pour lancer l'application:
echo.
echo 1. Lancez le backend (dans backend/):
echo    venv\Scripts\activate
echo    python main.py
echo.
echo 2. Lancez le frontend (dans frontend/):
echo    npm run dev
echo.
echo L'application sera accessible sur http://localhost:5173
echo.
pause
