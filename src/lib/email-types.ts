export type Recipient = {
  id:              string
  email:           string
  full_name:       string | null
  employer:        string | null
  account_manager: string | null
}

export type EmailAttachment = {
  filename: string
  content:  string  // base64
}
