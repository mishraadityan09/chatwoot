<script setup>
// FlightsMojo (FM-41): Settings → Email Routing.
import BaseSettingsHeader from '../components/BaseSettingsHeader.vue';
import SettingsLayout from '../SettingsLayout.vue';
import FmEmailRouting from 'dashboard/flightsmojo/emailRouting/FmEmailRouting.vue';
</script>

<template>
  <SettingsLayout :no-records-found="false">
    <template #header>
      <BaseSettingsHeader
        :title="$t('FLIGHTSMOJO.EMAIL_ROUTING.TITLE')"
        :description="$t('FLIGHTSMOJO.EMAIL_ROUTING.DESCRIPTION')"
      />
    </template>
    <template #body>
      <FmEmailRouting />
    </template>
  </SettingsLayout>
</template>
