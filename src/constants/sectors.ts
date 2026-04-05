export const VALID_SECTORS = [
  "Accommodation and food services",
  "Arts, entertainment, and recreation",
  "Educational services",
  "Administrative and support and waste management and remediation services",
  "Agriculture, forestry, fishing and hunting",
  "Construction",
  "Durable goods manufacturing",
  "Finance and insurance",
  "Government and government enterprises",
  "Health care and social assistance",
  "Information",
  "Natural resources and mining",
  "Nondurable goods manufacturing",
  "Other services (except government and government enterprises)",
  "Private industries",
  "Professional and business services",
  "Real estate and rental and leasing",
  "Retail trade",
  "Transportation and warehousing",
  "Utilities",
  "Wholesale trade",
] as const;

export type ValidSector = (typeof VALID_SECTORS)[number];
export const VALID_HORIZONS = ["1y", "3y", "5y"] as const;
export type ValidHorizon = (typeof VALID_HORIZONS)[number];