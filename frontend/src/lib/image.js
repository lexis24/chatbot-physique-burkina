const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

/**
 * Redimensionne/recompresse une photo prise depuis un mobile (souvent 3-4 Mo) avant envoi au
 * serveur : accélère l'upload en 3G/4G et reste confortablement sous la limite serveur (8 Mo)
 * sans perte visible pour un exercice de maths (texte/schéma, pas une photo artistique).
 */
export async function compressImageFile(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY))
    if (!blob) return file
    return new File([blob], (file.name || "exercice").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
  } catch {
    // Compression best-effort : si le navigateur ne supporte pas createImageBitmap/canvas
    // (ou si le fichier n'est pas décodable), on envoie l'original plutôt que d'échouer.
    return file
  }
}
