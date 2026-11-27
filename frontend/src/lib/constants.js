export const CATEGORIES = [
  { key: "Food", chip: "cat-food", icon: "utensils" },
  { key: "Transport", chip: "cat-transport", icon: "bus" },
  { key: "Shopping", chip: "cat-shopping", icon: "shopping-bag" },
  { key: "Entertainment", chip: "cat-entertainment", icon: "clapperboard" },
  { key: "Bills", chip: "cat-bills", icon: "receipt-text" },
  { key: "Education", chip: "cat-education", icon: "book-open" },
  { key: "Health", chip: "cat-health", icon: "heart-pulse" },
  { key: "Other", chip: "cat-other", icon: "circle-dot" },
];

export const PALETTE = {
  primary: "#121417",
  sage: "#8FA58B",
  paleSage: "#E4EBDD",
  beige: "#EDE8DB",
  yellow: "#FBECAD",
  coral: "#FBD6E3",
  mint: "#CFEBD1",
  muted: "#6E7279",
  border: "#E8E6DD",
  seq: [
    "#FBD6E3", "#CFE1F6", "#FBECAD", "#CFEBD1",
    "#E0D6F5", "#FBD5BB", "#D7EDE4", "#F3DAD4",
  ],
};

export const INK_FOR = [
  "#8C2E54", "#244F84", "#6B5610", "#2A5C3B",
  "#4B3A86", "#8A4214", "#205943", "#8E3B2E",
];

export function categoryMeta(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

export function uid(prefix = "t") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;
}
