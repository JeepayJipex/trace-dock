import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './styles/main.css';

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
  ],
});

createApp(App).use(router).mount('#app');
