/**
 * Arma un link de búsqueda de Google Maps a partir de un texto libre
 * (dirección, esquina, "Ruta 5 km 12", lo que sea). No hace falta que sea
 * una dirección exacta ni que exista en Google: abre Maps con esa búsqueda,
 * igual que si la hubieran escrito a mano en el buscador de la web o la app.
 */
export function googleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
