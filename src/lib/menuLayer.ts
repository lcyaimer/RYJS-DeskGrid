import { computed, reactive } from 'vue'

const openMenus = reactive(new Set<string>())

export const hasOpenFloatingMenu = computed(() => openMenus.size > 0)

export function setFloatingMenuOpen(id: string, open: boolean): void {
  if (open) openMenus.add(id)
  else openMenus.delete(id)
}
