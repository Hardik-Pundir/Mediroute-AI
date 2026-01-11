import { LocationSuggestion } from '../types';

export const searchLocationSuggestions = async (query: string): Promise<LocationSuggestion[]> => {
  if (!query.trim() || query.length < 3) {
    return [];
  }
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`
    );
    const results = await response.json();
    
    if (results && results.length > 0) {
      return results.map((result: any, index: number) => ({
        id: `${result.place_id || index}`,
        name: result.display_name,
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      }));
    }
    return [];
  } catch (error) {
    console.error('Search error:', error);
    return [];
  }
};

export const openGoogleMaps = (
  route: { coordinates: [number, number][] } | null, 
  origin: { lat: number; lng: number }, 
  destination: { lat: number; lng: number }
) => {
  if (!route?.coordinates?.length) return;
  
  const originStr = `${origin.lat},${origin.lng}`;
  const destinationStr = `${destination.lat},${destination.lng}`;
  
  const waypoints = route.coordinates
    .filter((_, i) => i > 0 && i < route.coordinates.length - 1 && i % 5 === 0)
    .slice(0, 8)
    .map(coord => `${coord[0]},${coord[1]}`)
    .join('|');
  
  let googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destinationStr}&travelmode=driving`;
  if (waypoints) {
    googleMapsUrl += `&waypoints=${encodeURIComponent(waypoints)}`;
  }
  
  window.open(googleMapsUrl, '_blank');
};