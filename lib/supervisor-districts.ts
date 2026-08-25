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

const supervisorDistricts: Record<string, string> = {
  "aaron-peskin": "3",
  "ahsha-safai": "11",
  "alan-wong": "4",
  "bilal-mahmood": "5",
  "carmen-chu": "4",
  "catherine-stefani": "2",
  "christina-olague": "5",
  "chyanne-chen": "11",
  "connie-chan": "1",
  "danny-sauter": "3",
  "david-campos": "9",
  "david-chiu": "3",
  "dean-preston": "5",
  "gordon-mar": "4",
  "hillary-ronen": "9",
  "jackie-fielder": "9",
  "jane-kim": "6",
  "jeff-sheehy": "8",
  "joel-engardio": "4",
  "john-avalos": "11",
  "julie-christensen": "3",
  "katy-tang": "4",
  "london-breed": "5",
  "malia-cohen": "10",
  "mark-farrell": "2",
  "matt-dorsey": "6",
  "matt-haney": "6",
  "myrna-melgar": "7",
  "norman-yee": "7",
  "rafael-mandelman": "8",
  "sandra-fewer": "1",
  "scott-wiener": "8",
  "sean-elsbernd": "7",
  "shamann-walton": "10",
  "stephen-sherrill": "2",
  "vallie-brown": "5",
};

export function getDistrictNeighborhoods(district: string | null): string[] {
  if (!district) return [];
  return districtNeighborhoods[district.replace(/^0+/, "")] ?? [];
}

export function getSupervisorDistrict(slug: string, district: string | null): string | null {
  return district ?? supervisorDistricts[slug] ?? null;
}
