/* global axios */
// FlightsMojo (FM-39): administrators share unsolved tickets equally among picked agents.
import ApiClient from './ApiClient';

class TicketDistributionAPI extends ApiClient {
  constructor() {
    super('ticket_distribution', { accountScoped: true });
  }

  getOptions() {
    return axios.get(this.url);
  }

  preview(payload) {
    return axios.post(`${this.url}/preview`, payload);
  }

  apply(payload) {
    return axios.post(this.url, payload);
  }

  status(token) {
    return axios.get(`${this.url}/status`, { params: { token } });
  }
}

export default new TicketDistributionAPI();
