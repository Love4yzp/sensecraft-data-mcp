import dotenv from 'dotenv'
import merge from 'lodash.merge'
import path from 'path'



const SENSECRAFT_SITE_ENV = process.env.SENSECRAFT_SITE_ENV ?? "develop"
const setting = dotenv.config({ path: path.join(__dirname, '.env') }).parsed;
const envSetting = dotenv.config({ path: path.join(__dirname, `.env.${SENSECRAFT_SITE_ENV}`) }).parsed;

export const globalSetting = merge(setting, envSetting);
console.error("setting:" + JSON.stringify(globalSetting))
process.env.SENSECRAFT_DATA_MCP_LOG_LEVEL = globalSetting.LOGGER_LEVEL
