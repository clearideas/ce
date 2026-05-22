import { useRoute } from 'vue-router'

function shallowEqual(object1: any, object2: any): boolean {
  const keys1 = Object.keys(object1)
  const keys2 = Object.keys(object2)

  if (keys1.length !== keys2.length) return false

  for (const key of keys1) {
    if (object1[key] !== object2[key]) return false
  }

  return true
}

export function isAnyChildActive(item: any): boolean {
  const route = useRoute()

  return item.children.some((child: any) => {
    if (child.to) return child.to.name === route.name

    if ('children' in child) return isAnyChildActive(child)

    return false
  })
}

export function isNavLinkActive(item: any): boolean {
  const route = useRoute()

  if (item.to && item.to.params)
    return item.to.name === route.name && shallowEqual(item.to.params, route.params)
  else if (item.to) return item.to.name === route.name
  else return false
}

export function isGroupActive(navList: any): string[] {
  const activeGroup = ['']

  if (navList) {
    navList.forEach((item: any) => {
      if ('children' in item) {
        if (isAnyChildActive(item)) activeGroup.push(item.name)
      }
    })
  }

  return activeGroup.filter(Boolean)
}
