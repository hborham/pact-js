/**
 * Logger module.
 * @module logger
 * @private
 */

import { config } from './config';

const logger = {
  info: (msg: any) => {
    if (config.logging) {
      console.log(msg);
    }
  }
}

export { logger };
