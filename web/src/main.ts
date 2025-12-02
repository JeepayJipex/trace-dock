import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import App from './App.vue';
import './styles/main.css';

// Create a query client with default options
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./views/LogsView.vue'),
    },
    {
      path: '/log/:id',
      name: 'log-detail',
      component: () => import('./views/LogDetailView.vue'),
    },
    {
      path: '/errors',
      name: 'error-groups',
      component: () => import('./views/ErrorGroupsView.vue'),
    },
    {
      path: '/errors/:id',
      name: 'error-group-detail',
      component: () => import('./views/ErrorGroupDetailView.vue'),
    },
    {
      path: '/traces',
      name: 'traces',
      component: () => import('./views/TracesView.vue'),
    },
    {
      path: '/traces/:id',
      name: 'trace-detail',
      component: () => import('./views/TraceDetailView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('./views/SettingsView.vue'),
    },
  ],
});

const app = createApp(App);
app.use(router);
app.use(VueQueryPlugin, { queryClient });
app.mount('#app');
