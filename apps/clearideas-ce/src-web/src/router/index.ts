import { createRouter, createWebHistory } from 'vue-router'
import { appConfigApi } from '../api/client'
import LoginView from '../views/LoginView.vue'
import SitesView from '../views/SitesView.vue'

// Only the login and sites views are in the entry chunk; everything else loads on first navigation
// (the PDF viewer, markdown/highlighting, agents and analytics UIs are the heavy ones).
const AgentsView = () => import('../views/AgentsView.vue')
const AnalyticsView = () => import('../views/AnalyticsView.vue')
const AskView = () => import('../views/AskView.vue')
const DocsView = () => import('../views/DocsView.vue')
const FileView = () => import('../views/FileView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const SiteView = () => import('../views/SiteView.vue')
const UsersView = () => import('../views/UsersView.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/sites' },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/sites', name: 'sites', component: SitesView },
    { path: '/sites/:sitesTab(all|favourites|owned)', name: 'sites-tab', component: SitesView },
    { path: '/site/:siteId/file/:fileId/:fileTab(file|properties)?', name: 'file', component: FileView },
    {
      path: '/site/:siteId/:siteTab(content|ai|users|settings)/:siteSettingsTab?',
      name: 'site-tab',
      component: SiteView,
    },
    {
      path: '/site/:siteId/:folderId/:siteTab(content|ai|users|settings)/:siteSettingsTab?',
      name: 'site-folder-tab',
      component: SiteView,
    },
    { path: '/site/:siteId/:folderId?', name: 'site', component: SiteView },
    { path: '/ask/:conversationId([a-f\\d]{24})?', name: 'ask', component: AskView },
    { path: '/users', name: 'users', component: UsersView },
    { path: '/agents', name: 'agents', component: AgentsView },
    { path: '/analytics', name: 'analytics', redirect: '/analytics/dashboard' },
    {
      path: '/analytics/:category(dashboard|most-accessed|content-activity|search-terms|most-active|usage-times)',
      name: 'analytics-category',
      component: AnalyticsView,
    },
    { path: '/docs/:slug(.*)*', name: 'docs-page', component: DocsView },
    { path: '/settings/:section?', name: 'settings', component: SettingsView },
    { path: '/:pathMatch(.*)*', redirect: '/sites' },
  ],
})

router.beforeEach(async to => {
  if (!to.path.startsWith('/docs')) return true
  try {
    const config = await appConfigApi.get()
    return config.docsEnabled ? true : '/sites'
  } catch {
    return '/sites'
  }
})
