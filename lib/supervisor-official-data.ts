const portraitOrigin = "https://media.api.sf.gov/original_images";

const portraitFiles: Record<string, string> = {
  "connie-chan": "D01-Connie_Chan_2025_profile.png",
  "stephen-sherrill": "D02-Stephen_Sherrill_2025_profile.png",
  "danny-sauter": "D03-Danny_Sauter_2025_profile.png",
  "alan-wong": "D04-Alan_Wong_2026_profile.png",
  "bilal-mahmood": "D05-Bilal_Mahmood_2025_profile.png",
  "matt-dorsey": "D06-Matt_Dorsey_2025_profile.png",
  "myrna-melgar": "D07-Myrna_Melgar_2025_profile.png",
  "rafael-mandelman": "D08-Rafael_Mandelman_2025_profile.png",
  "jackie-fielder": "D09-Jackie-Fielder_2025_profile.png",
  "shamann-walton": "D10-Shamann_Walton_2025_profile.png",
  "chyanne-chen": "D11-Chyanne_Chen_2025_profile.png",
};

export const currentSupervisorSalary = {
  annualBaseSalary: 180_128,
  fiscalYear: "2026–27",
  effectiveDate: "July 1, 2026",
  sourceUrl: "https://media.api.sf.gov/documents/05-18-26_Item_11_Amended_2026-27_BOS_Report_of_Salary_Survey_final.pdf#page=6",
};

export function getOfficialSupervisorPortrait(slug: string) {
  const filename = portraitFiles[slug];
  return filename ? `${portraitOrigin}/${filename}` : null;
}
