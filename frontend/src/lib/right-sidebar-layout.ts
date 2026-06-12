export const RIGHT_SIDEBAR_LAYOUT_KEY = "obails:right-sidebar-layout";

export const RIGHT_SIDEBAR_SECTIONS = ["outline", "outgoing", "backlinks"] as const;

export type RightSidebarSectionId = (typeof RIGHT_SIDEBAR_SECTIONS)[number];

export type RightSidebarLayout = {
  collapsed: Record<RightSidebarSectionId, boolean>;
  sizes: Record<RightSidebarSectionId, number>;
};

export function defaultRightSidebarLayout(): RightSidebarLayout {
  return {
    collapsed: {
      outline: false,
      outgoing: false,
      backlinks: false,
    },
    sizes: {
      outline: 1,
      outgoing: 1,
      backlinks: 1,
    },
  };
}

export function normalizeRightSidebarLayout(value: unknown): RightSidebarLayout {
  const defaults = defaultRightSidebarLayout();
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<RightSidebarLayout>;
  const collapsed = { ...defaults.collapsed };
  const sizes = { ...defaults.sizes };

  for (const section of RIGHT_SIDEBAR_SECTIONS) {
    const collapsedValue = candidate.collapsed?.[section];
    if (typeof collapsedValue === "boolean") {
      collapsed[section] = collapsedValue;
    }

    const sizeValue = candidate.sizes?.[section];
    if (typeof sizeValue === "number" && Number.isFinite(sizeValue) && sizeValue > 0) {
      sizes[section] = sizeValue;
    }
  }

  return { collapsed, sizes };
}

export function toggleRightSidebarSection(
  layout: RightSidebarLayout,
  section: RightSidebarSectionId,
): RightSidebarLayout {
  return {
    collapsed: {
      ...layout.collapsed,
      [section]: !layout.collapsed[section],
    },
    sizes: { ...layout.sizes },
  };
}
