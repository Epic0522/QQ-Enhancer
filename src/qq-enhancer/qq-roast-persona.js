// Deployment customization point:
// Fill these patterns and phrase banks in your own deployment if you want a
// sharper group-chat style. The release package intentionally ships with no
// private assistant profile, private slang corpus, or hard-coded community rules.

export const customRoastInterestPattern = /$a/;

export const customSharpRoastPattern = /$a/;

export const customRoastPhraseBank = [
  // Example:
  // "short custom phrase"
];

export const customRoastPersonaGuide = [
  // Example:
  // "Describe the deployer's desired group-chat tone here."
];

export const customRoastAntiPatterns = [
  // Example:
  // "Describe styles or topics this deployment should avoid."
];

export function buildCustomRoastInstructions() {
  return [
    ...customRoastPersonaGuide,
    ...customRoastAntiPatterns
  ].filter(Boolean);
}
