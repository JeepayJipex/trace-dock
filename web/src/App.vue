<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppHeader from './components/AppHeader.vue';
</script>

<template>
  <div class="min-h-screen bg-dark-950 text-gray-100">
    <AppHeader />
    <main class="container mx-auto px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
