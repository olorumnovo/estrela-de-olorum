export const contributionDefaults = {
  dueDay: "10",
  monthlyFull: "300",
  monthlyDiscount: "230",
  courseFull: "200",
  courseDiscount: "180",
  enrollment: "50",
  comboSilver: "330",
  comboGold: "430",
  financeWhatsapp: "",
};

export const contributionKeys = Object.keys(contributionDefaults);

export function contributionSettingKey(key: string) {
  return `contribution_${key}`;
}
