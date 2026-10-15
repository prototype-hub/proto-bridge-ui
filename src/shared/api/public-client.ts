import { createClient } from './client'
// Deliberate anonymous boundary for captcha/login and public share APIs.
export const publicRequest = createClient(false)
