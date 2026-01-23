// Utility to fetch bus stops from 2GIS API
// Note: This is a placeholder - you'll need to use actual 2GIS API or another source

export interface StopData {
  name: string;
  latitude: number;
  longitude: number;
}

// Dushanbe bus stops data (you can expand this or use 2GIS API)
const DUSHANBE_STOPS: StopData[] = [
  { name: 'Автовокзал', latitude: 38.5598, longitude: 68.7738 },
  { name: 'Шахраки Мехробод', latitude: 38.5700, longitude: 68.7800 },
  { name: 'Шахраки Мехробод 1', latitude: 38.5710, longitude: 68.7810 },
  { name: 'Шахраки Мехробод 2', latitude: 38.5720, longitude: 68.7820 },
  { name: 'Площадь Дусти', latitude: 38.5600, longitude: 68.7740 },
  { name: 'Рудаки', latitude: 38.5650, longitude: 68.7750 },
  { name: 'Парк Рудаки', latitude: 38.5660, longitude: 68.7760 },
  { name: 'Университет', latitude: 38.5500, longitude: 68.7700 },
  { name: 'Стадион', latitude: 38.5550, longitude: 68.7720 },
  { name: 'Больница', latitude: 38.5450, longitude: 68.7680 },
];

export async function searchStopsFrom2GIS(query: string): Promise<StopData[]> {
  // Placeholder - in production, use 2GIS API
  // Example: https://catalog.api.2gis.com/3.0/items?q=остановка&point=68.7738,38.5598&radius=10000&key=YOUR_API_KEY
  
  const lowerQuery = query.toLowerCase();
  return DUSHANBE_STOPS.filter(stop => 
    stop.name.toLowerCase().includes(lowerQuery)
  );
}

export async function getAllStopsFrom2GIS(): Promise<StopData[]> {
  // Placeholder - fetch all stops from 2GIS API
  return DUSHANBE_STOPS;
}
