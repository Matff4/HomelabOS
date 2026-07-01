export interface PluginSummary {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  bundled?: boolean;
}

export interface MarketplaceEntry {
  id: string;
  name: string;
  version: string;
  tarball_url: string;
  description?: string | null;
  icon?: string | null;
  api_version: number;
  homelabos_min?: string | null;
}

export interface MarketplaceCatalog {
  version: number;
  updated_at?: string | null;
  plugins: MarketplaceEntry[];
}

export interface PluginActionResult {
  id: string;
  version?: string;
  restart_required: boolean;
  message: string;
}
