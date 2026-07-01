import type { ComponentInfo } from './types';

export interface ActionResult {
  ok?: boolean;
  state?: string;
  active?: boolean;
}

export async function invokePluginAction(component: ComponentInfo): Promise<ActionResult> {
  const mode = component.action_mode === 'toggle' ? 'toggle' : 'momentary';
  const res = await fetch(
    `/api/plugins/${encodeURIComponent(component.plugin_id)}/action/${encodeURIComponent(component.id)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    },
  );
  if (!res.ok) throw new Error('Action failed');
  return (await res.json()) as ActionResult;
}

export async function fetchActionActive(component: ComponentInfo): Promise<boolean> {
  if (component.action_mode !== 'toggle') return false;
  try {
    const res = await fetch(
      `/api/plugins/${encodeURIComponent(component.plugin_id)}/action/${encodeURIComponent(component.id)}/state`,
    );
    if (!res.ok) return false;
    const body = (await res.json()) as { active?: boolean };
    return Boolean(body.active);
  } catch {
    return false;
  }
}
