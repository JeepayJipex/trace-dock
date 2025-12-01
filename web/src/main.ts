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
  ],
});

createApp(App).use(router).mount('#app');
