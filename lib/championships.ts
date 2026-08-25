/**
 * Championnats proposés à la création d'une ligue manuelle.
 *
 * On n'expose que ceux pour lesquels le vivier de joueurs est réellement
 * disponible sans MPG (via Sofascore + MPGStats). La Ligue des Champions est
 * volontairement exclue : ses effectifs recoupent les autres championnats et
 * elle ne correspond pas à une ligue MPG classique.
 */

export interface ChampionshipOption {
  /** championshipId interne, compatible avec toute la chaîne existante. */
  id: string;
  name: string;
  /** Code pays ISO pour l'affichage d'un drapeau. */
  countryCode: string;
}

const CHAMPIONSHIPS: ChampionshipOption[] = [
  { id: "1", name: "Ligue 1", countryCode: "fr" },
  { id: "2", name: "Premier League", countryCode: "gb" },
  { id: "3", name: "La Liga", countryCode: "es" },
  { id: "5", name: "Serie A", countryCode: "it" },
  { id: "4", name: "Ligue 2", countryCode: "fr" },
  { id: "7", name: "Super Lig", countryCode: "tr" },
];

export function getSupportedChampionships(): ChampionshipOption[] {
  return CHAMPIONSHIPS;
}

export function getChampionshipById(id: string): ChampionshipOption | undefined {
  return CHAMPIONSHIPS.find((c) => c.id === id);
}
