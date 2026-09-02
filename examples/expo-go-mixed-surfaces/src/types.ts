export type CityVibe = "after-dark" | "culture" | "food";

export interface CityPlan {
  readonly vibe: CityVibe;
}

export interface SavedStop {
  readonly id: string;
  readonly title: string;
}
