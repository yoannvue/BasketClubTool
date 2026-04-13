"""
core/drive.py
Authentification OAuth Google et opérations Drive / Slides.
Le token est sauvegardé dans config/token.json après le premier login.
Les lancements suivants sont silencieux (pas de navigateur).
"""

import json
import os
import requests as http_requests
from pathlib import Path
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/presentations",
]
TOKEN_PATH  = Path("config/token.json")
CREDS_PATH  = Path("config/credentials.json")

# ──────────────────────────────────────────────
# Auth
# ──────────────────────────────────────────────

def get_credentials() -> Credentials:
    """Retourne des credentials valides.
    - Si token.json existe et est valide → l'utilise directement
    - Si expiré → le rafraîchit automatiquement
    - Si absent → ouvre le navigateur pour l'autorisation (une seule fois)
    """
    creds = None

    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDS_PATH.exists():
                raise FileNotFoundError(
                    f"Fichier credentials.json introuvable dans {CREDS_PATH}.\n"
                    "Télécharge-le depuis Google Cloud Console → APIs & Services → Credentials."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_PATH, "w") as f:
            f.write(creds.to_json())

    return creds


def get_services():
    """Retourne (drive_service, slides_service)."""
    creds = get_credentials()
    drive  = build("drive",  "v3", credentials=creds)
    slides = build("slides", "v1", credentials=creds)
    return drive, slides


# ──────────────────────────────────────────────
# Drive
# ──────────────────────────────────────────────

def _mime_type(local_path: str) -> str:
    ext = Path(local_path).suffix.lower()
    return {
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".pdf":  "application/pdf",
    }.get(ext, "application/octet-stream")


def upload_file(local_path: str, folder_id: str, filename: str = None) -> str:
    """Upload (ou remplace) un fichier dans le dossier Drive.
    Retourne l'URL de partage du fichier.
    """
    drive, _ = get_services()
    name = filename or Path(local_path).name
    mime = _mime_type(local_path)

    # Cherche si le fichier existe déjà dans le dossier
    existing = drive.files().list(
        q=f"name='{name}' and '{folder_id}' in parents and trashed=false",
        fields="files(id)",
        spaces="drive",
    ).execute().get("files", [])

    media = MediaFileUpload(local_path, mimetype=mime, resumable=True)

    if existing:
        file_id = existing[0]["id"]
        drive.files().update(
            fileId=file_id,
            media_body=media,
        ).execute()
    else:
        meta = {"name": name, "parents": [folder_id]}
        result = drive.files().create(
            body=meta,
            media_body=media,
            fields="id",
        ).execute()
        file_id = result["id"]

        # Partage : quiconque possède le lien peut modifier
        drive.permissions().create(
            fileId=file_id,
            body={"type": "anyone", "role": "writer"},
        ).execute()

    return f"https://drive.google.com/file/d/{file_id}/view"


# ──────────────────────────────────────────────
# Slides helpers
# ──────────────────────────────────────────────

def copy_presentation(template_id: str, temp_name: str) -> str:
    """Duplique un template Google Slides. Retourne l'ID de la copie."""
    drive, _ = get_services()
    copy = drive.files().copy(
        fileId=template_id,
        body={"name": temp_name},
    ).execute()
    return copy["id"]


def replace_placeholders(presentation_id: str, replacements: dict[str, str]) -> None:
    """Remplace tous les placeholders {{KEY}} dans la présentation."""
    _, slides = get_services()
    requests_body = [
        {
            "replaceAllText": {
                "containsText": {"text": placeholder, "matchCase": True},
                "replaceText": str(value),
            }
        }
        for placeholder, value in replacements.items()
    ]
    if requests_body:
        slides.presentations().batchUpdate(
            presentationId=presentation_id,
            body={"requests": requests_body},
        ).execute()


def export_slide_as_png(presentation_id: str, output_path: str) -> str:
    """Exporte la première slide en PNG haute résolution.
    Utilise l'API getThumbnail (LARGE = ~1600px de large).
    Retourne le chemin du fichier PNG créé.
    """
    _, slides = get_services()
    creds = get_credentials()

    # Récupère l'ID de la première slide
    pres = slides.presentations().get(presentationId=presentation_id).execute()
    first_page_id = pres["slides"][0]["objectId"]

    # Demande le thumbnail LARGE
    thumbnail = (
        slides.presentations()
        .pages()
        .getThumbnail(
            presentationId=presentation_id,
            pageObjectId=first_page_id,
            thumbnailProperties_mimeType="PNG",
            thumbnailProperties_thumbnailSize="LARGE",
        )
        .execute()
    )

    img_url = thumbnail["contentUrl"]

    # L'URL peut être signée (sans auth) ou nécessiter le Bearer token
    resp = http_requests.get(img_url, headers={"Authorization": f"Bearer {creds.token}"})
    if resp.status_code != 200:
        # Retry sans auth (URLs signées temporaires)
        resp = http_requests.get(img_url)
    resp.raise_for_status()

    with open(output_path, "wb") as f:
        f.write(resp.content)

    return output_path


def delete_presentation(presentation_id: str) -> None:
    """Supprime une présentation temporaire du Drive."""
    drive, _ = get_services()
    drive.files().delete(fileId=presentation_id).execute()


# ──────────────────────────────────────────────
# Suppression des lignes vides dans les tableaux Slides
# ──────────────────────────────────────────────

def _get_cell_text(cell: dict) -> str:
    """Extrait le texte brut d'une cellule Slides."""
    text_content = []
    for elem in cell.get("text", {}).get("textElements", []):
        run = elem.get("textRun", {})
        text_content.append(run.get("content", ""))
    return "".join(text_content).strip()


def delete_empty_table_rows(presentation_id: str) -> int:
    """Parcourt tous les tableaux de la première slide et supprime les lignes
    dont TOUTES les cellules sont vides (après remplacement des placeholders).
    Retourne le nombre de lignes supprimées.
    Les suppressions se font de bas en haut pour éviter le décalage d'index.
    """
    _, slides_svc = get_services()

    pres    = slides_svc.presentations().get(presentationId=presentation_id).execute()
    slide   = pres["slides"][0]
    requests_body = []

    for element in slide.get("pageElements", []):
        table = element.get("table")
        if not table:
            continue

        table_id = element["objectId"]
        rows     = table.get("tableRows", [])

        # Repère les indices de lignes entièrement vides (de bas en haut)
        empty_indices = []
        for row_idx, row in enumerate(rows):
            cells = row.get("tableCells", [])
            if all(_get_cell_text(c) == "" for c in cells):
                empty_indices.append(row_idx)

        # Supprime de bas en haut pour ne pas décaler les indices
        for row_idx in reversed(empty_indices):
            requests_body.append({
                "deleteTableRow": {
                    "tableObjectId": table_id,
                    "cellLocation": {"rowIndex": row_idx},
                }
            })

    if requests_body:
        slides_svc.presentations().batchUpdate(
            presentationId=presentation_id,
            body={"requests": requests_body},
        ).execute()

    return len(requests_body)
