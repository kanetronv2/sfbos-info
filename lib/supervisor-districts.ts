const districtNeighborhoods: Record<string, string[]> = {
  "1": ["Inner Richmond", "Central Richmond", "Outer Richmond", "Vista del Mar", "Sea Cliff", "Lake District", "Presidio Terrace", "Lone Mountain", "Golden Gate Park", "Lincoln Park"],
  "2": ["Marina", "Cow Hollow", "Pacific Heights", "Presidio Heights", "Jordan Park", "Laurel Heights", "Presidio", "Lower Pacific Heights", "Cathedral Hill", "Russian Hill"],
  "3": ["North Beach", "Chinatown", "Telegraph Hill", "North Waterfront", "Financial District", "Nob Hill", "Union Square", "Maiden Lane", "Russian Hill"],
  "4": ["Central Sunset", "Outer Sunset", "Parkside", "Outer Parkside", "Pine Lake Park", "Lakeshore", "Merced Manor"],
  "5": ["Haight-Ashbury", "Lower Haight", "Fillmore", "Western Addition", "North of Panhandle", "Japantown", "Hayes Valley", "Tenderloin", "Civic Center"],
  "6": ["Mid-Market", "Rincon Hill", "East Cut", "South of Market", "South Beach", "Mission Bay", "Treasure Island", "Yerba Buena Island"],
  "7": ["Inner Parkside", "Golden Gate Heights", "Inner Sunset", "Parnassus Heights", "Clarendon Heights", "Twin Peaks", "West Portal", "Forest Knolls", "Midtown Terrace", "Forest Hill", "Miraloma Park", "Sunnyside", "Sherwood Forest", "Westwood Highlands", "Westwood Park", "St. Francis Wood", "Monterey Heights", "Mount Davidson", "Balboa Terrace", "Ingleside Terraces", "Stonestown", "Lakeside", "Parkmerced", "Lake Merced"],
  "8": ["Castro", "Noe Valley", "Diamond Heights", "Glen Park", "Corona Heights", "Eureka Valley", "Dolores Heights", "Mission Dolores", "Duboce Triangle", "Buena Vista", "Cole Valley", "Ashbury Heights", "Twin Peaks"],
  "9": ["Mission", "Bernal Heights", "Portola"],
  "10": ["Potrero Hill", "Central Waterfront", "Dogpatch", "Bayview-Hunters Point", "Bayview Heights", "India Basin", "Silver Terrace", "Candlestick Point", "Visitacion Valley", "Little Hollywood", "Sunnydale", "McLaren Park"],
  "11": ["Excelsior", "Ingleside", "Oceanview", "Merced Heights", "Ingleside Heights", "Mission Terrace", "Outer Mission", "Cayuga", "Crocker-Amazon"],
};

export function getDistrictNeighborhoods(district: string | null): string[] {
  if (!district) return [];
  return districtNeighborhoods[district.replace(/^0+/, "")] ?? [];
}
