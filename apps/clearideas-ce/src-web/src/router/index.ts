import { createRouter, createWebHistory } from 'vue-router'
import AnalyticsView from '../views/AnalyticsView.vue'
import AgentsView from '../views/AgentsView.vue'
import DocsView from '../views/DocsView.vue'
import LoginView from '../views/LoginView.vue'
import FileView from '../views/FileView.vue'
import SettingsView from '../views/SettingsView.vue'
import SiteView from '../views/SiteView.vue'
import SitesView from '../views/SitesView.vue'
import UsersView from '../views/UsersView.vue'
import { appConfigApi } from '../api/client'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/sites' },
    { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
    { path: '/sites', name: 'sites', component: SitesView },
    { path: '/sites/:sitesTab(all|favourites|owned)', name: 'sites-tab', component: SitesView },
    { path: '/site/:siteId/file/:fileId/:fileTab(file|properties)?', name: 'file', component: FileView },
    { path: '/site/:siteId/:siteTab(content|ai|users|settings)/:siteSettingsTab?', name: 'site-tab', component: SiteView },
    { path: '/site/:siteId/:folderId/:siteTab(content|ai|users|settings)/:siteSettingsTab?', name: 'site-folder-tab', component: SiteView },
    { path: '/site/:siteId/:folderId?', name: 'site', component: SiteView },
    { path: '/users', name: 'users', component: UsersView },
    { path: '/agents', name: 'agents', component: AgentsView },
    { path: '/analytics', name: 'analytics', redirect: '/analytics/dashboard' },
    { path: '/analytics/:category(dashboard|most-accessed|content-activity|most-active|usage-times)', name: 'analytics-category', component: AnalyticsView },
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
