<script setup lang="ts">
import {
  Menu as AMenu,
  MenuItem as AMenuItem,
  Button as AButton,
  Space as ASpace,
  Drawer as ADrawer,
  Dropdown as ADropdown,
  Avatar as AAvatar,
  Breadcrumb as ABreadcrumb,
  BreadcrumbItem as ABreadcrumbItem,
} from 'ant-design-vue'
import {
  MenuOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  GlobalOutlined,
} from '@ant-design/icons-vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSession } from '@/app/stores/session'
import { useSettings } from '@/app/stores/settings'
import { useNavigation } from '@/app/composables/useNavigation'
import { useBranding } from '@/app/stores/branding'
import SidebarItems from './SidebarItems.vue'
import MenuIcon from '@/shared/components/MenuIcon.vue'
const branding = useBranding()
const { t, locale } = useI18n()
const router = useRouter()
const session = useSession()
const settings = useSettings()
const { navigation, showSidebar, openKeys, mobileOpen, collapsed, primary, navigate } =
  useNavigation()
async function logout() {
  try {
    await session.logout()
  } finally {
    await router.replace('/login')
  }
}
</script>
<template>
  <div
    class="pro-layout"
    :class="{ 'pro-layout-collapsed': collapsed && showSidebar, 'pro-layout-full': !showSidebar }"
  >
    <header
      class="pro-global-header"
      :class="{ 'pro-header-dark': branding.front.headerTheme === 'dark' }"
    >
      <router-link to="/" class="pro-brand"
        ><img :src="branding.images.logo" alt="" class="pro-logo" /><span>{{
          branding.title
        }}</span></router-link
      >
      <nav class="pro-primary-nav" :aria-label="t('layout.primary')">
        <a-menu
          mode="horizontal"
          :selected-keys="navigation.root ? [navigation.root.key] : []"
          @click="(e) => primary(e.key)"
        >
          <a-menu-item v-for="item in navigation.primary" :key="item.key"
            ><template v-if="item.icon" #icon><menu-icon :name="item.icon" /></template
            >{{ item.title }}</a-menu-item
          >
        </a-menu>
      </nav>
      <a-space class="pro-header-actions">
        <a-button
          type="text"
          :aria-label="t('common.language')"
          @click="settings.setLanguage(locale === 'zh' ? 'en' : 'zh')"
          ><global-outlined /><span class="pro-language-label">{{
            t('common.language')
          }}</span></a-button
        >
        <a-dropdown :trigger="['click']"
          ><a-button type="text" class="pro-user"
            ><a-avatar :size="24" :src="session.user?.avatar"
              ><template #icon><user-outlined /></template></a-avatar
            ><span>{{ session.user?.name }}</span></a-button
          >
          <template #overlay
            ><a-menu
              ><a-menu-item key="profile" @click="router.push('/account/center')"
                ><user-outlined /> {{ t('layout.profile') }}</a-menu-item
              ><a-menu-item key="logout" @click="logout"
                ><logout-outlined /> {{ t('common.logout') }}</a-menu-item
              ></a-menu
            ></template
          >
        </a-dropdown>
      </a-space>
    </header>
    <aside v-if="showSidebar" class="pro-sider" :aria-label="t('layout.secondary')">
      <a-menu
        v-if="!mobileOpen"
        v-model:open-keys="openKeys"
        :inline-collapsed="collapsed"
        :selected-keys="navigation.selectedKeys"
        mode="inline"
        @click="(e) => navigate(e.key)"
        ><sidebar-items :items="navigation.secondary"
      /></a-menu>
      <a-button
        type="text"
        class="pro-sider-trigger"
        :aria-label="t(collapsed ? 'layout.expand' : 'layout.collapse')"
        @click="collapsed = !collapsed"
        ><menu-unfold-outlined v-if="collapsed" /><menu-fold-outlined v-else
      /></a-button>
    </aside>
    <main class="pro-main">
      <div class="pro-breadcrumb">
        <a-button
          v-if="showSidebar"
          type="text"
          class="pro-mobile-trigger"
          :aria-label="t('layout.openMenu')"
          @click="mobileOpen = true"
          ><menu-outlined /></a-button
        ><a-breadcrumb
          ><a-breadcrumb-item v-for="item in navigation.trail" :key="item.key">{{
            item.title
          }}</a-breadcrumb-item></a-breadcrumb
        >
      </div>
      <router-view />
    </main>
    <a-drawer
      v-if="showSidebar"
      v-model:open="mobileOpen"
      placement="left"
      :title="navigation.root?.title"
      :width="280"
      ><nav :aria-label="t('layout.secondary')">
        <a-menu
          v-model:open-keys="openKeys"
          :selected-keys="navigation.selectedKeys"
          mode="inline"
          @click="(e) => navigate(e.key)"
          ><sidebar-items :items="navigation.secondary"
        /></a-menu></nav
    ></a-drawer>
  </div>
</template>
<style scoped src="./admin-layout.css"></style>
