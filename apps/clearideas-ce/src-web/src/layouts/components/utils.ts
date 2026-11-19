import { useRoute, type RouteLocationRaw } from 'vue-router'

/** An entry in the vertical navigation: a link, a section heading or a divider. */
export type NavMenuItem = {
  name?: string
  title?: string
  heading?: string
  icon?: string
  iconClass?: string
  iconColor?: string
  to?: RouteLocationRaw
  href?: string
  target?: string
  avatar?: string
  divider?: boolean
  onClick?: () => void
  mobileTitle?: string
}

function shallowEqual(object1: Record<string, unknown>, object2: Record<string, unknown>): boolean {
  const keys1 = Object.keys(object1)
  const keys2 = Object.keys(object2)
  if (keys1.length !== keys2.length) return false
  return keys1.every(key => object1[key] === object2[key])
}

/** A nav link is active when its named route (and params, when it has any) match the current route. */
export function isNavLinkActive(item: Pick<NavMenuItem, 'to'>): boolean {
  const route = useRoute()
  const to = item.to
  if (!to || typeof to === 'string' || !('name' in to) || !to.name) return false
  if (to.name !== route.name) return false
  if (to.params)
    return shallowEqual(to.params as Record<string, unknown>, route.params as Record<string, unknown>)
  return true
}
