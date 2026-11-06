/* global axios */
// FlightsMojo (FM-41): Settings → Email Routing (which inbox a new mail goes to).
import ApiClient from './ApiClient';

class EmailRoutesAPI extends ApiClient {
  constructor() {
    super('email_routes', { accountScoped: true });
  }

  getRules() {
    return axios.get(this.url);
  }

  saveRules(rules) {
    return axios.put(this.url, { rules });
  }

  check(payload) {
    return axios.post(`${this.url}/check`, payload);
  }
}

export default new EmailRoutesAPI();
