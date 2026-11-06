// FlightsMojo (FM-41): Settings → Email Routing (administrators only).
import { frontendURL } from '../../../../helper/URLHelper';
import SettingsWrapper from '../SettingsWrapper.vue';
import EmailRoutingIndex from './index.vue';

export default {
  routes: [
    {
      path: frontendURL('accounts/:accountId/settings/email-routing'),
      component: SettingsWrapper,
      children: [
        {
          path: '',
          name: 'email_routing_index',
          component: EmailRoutingIndex,
          meta: {
            permissions: ['administrator'],
          },
        },
      ],
    },
  ],
};
