import { Injectable, Logger } from '@nestjs/common';

/**
 * Configuração da integração Nuvemshop, lida das variáveis de ambiente.
 * Para uma ÚNICA loja própria, o caminho mais simples é o "Aplicativo sob medida":
 * gera um access_token permanente + store_id, sem necessidade do fluxo OAuth completo.
 *
 * Variáveis:
 *  - NUVEMSHOP_ENABLED         "true" para ativar (default: false)
 *  - NUVEMSHOP_STORE_ID        id numérico da loja
 *  - NUVEMSHOP_ACCESS_TOKEN    token permanente do app
 *  - NUVEMSHOP_CLIENT_SECRET   segredo do app (para validar o HMAC dos webhooks)
 *  - NUVEMSHOP_API_VERSION     versão da API (default: 2025-03)
 *  - NUVEMSHOP_USER_AGENT      obrigatório pela Nuvemshop (nome + contato)
 */
@Injectable()
export class NuvemshopConfig {
  private readonly logger = new Logger('NuvemshopConfig');

  get enabled(): boolean {
    return (process.env.NUVEMSHOP_ENABLED || 'false').toLowerCase() === 'true';
  }
  get storeId(): string {
    return process.env.NUVEMSHOP_STORE_ID || '';
  }
  get accessToken(): string {
    return process.env.NUVEMSHOP_ACCESS_TOKEN || '';
  }
  get clientSecret(): string {
    return process.env.NUVEMSHOP_CLIENT_SECRET || '';
  }
  get apiVersion(): string {
    return process.env.NUVEMSHOP_API_VERSION || '2025-03';
  }
  get userAgent(): string {
    return process.env.NUVEMSHOP_USER_AGENT || 'Corpo e Onda Estoque (contato@corpoonda.com.br)';
  }
  get baseUrl(): string {
    return `https://api.tiendanube.com/${this.apiVersion}/${this.storeId}`;
  }

  /** Verdadeiro só quando a flag está ligada E as credenciais mínimas existem. */
  get isOperational(): boolean {
    const ok = this.enabled && !!this.storeId && !!this.accessToken;
    if (this.enabled && !ok) {
      this.logger.warn('NUVEMSHOP_ENABLED=true, mas faltam STORE_ID/ACCESS_TOKEN. Integração inativa.');
    }
    return ok;
  }
}
