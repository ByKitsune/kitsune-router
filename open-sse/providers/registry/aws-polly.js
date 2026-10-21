export default {
  id: "aws-polly",
  alias: "polly",
  display: {
    name: "AWS Polly",
    icon: "record_voice_over",
    color: "#FF9900",
    textIcon: "PL",
    website: "https://aws.amazon.com/polly/",
    notice: {
      text: "Native reference: Standard $4, Neural $16, Long-form $100, Generative $30 per 1M billed characters; GovCloud prices differ. This gateway has no aws-polly TTS format handler/SigV4 signer, so registry configuration alone does not enable synthesis.",
      apiKeyUrl: "https://console.aws.amazon.com/iam/home#/security_credentials"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "tts"
  ],
  ttsConfig: {
    baseUrl: "https://polly.{region}.amazonaws.com/v1/speech",
    authType: "apikey",
    authHeader: "aws-sigv4",
    format: "aws-polly",
    models: [
      {
        id: "standard",
        name: "Standard"
      },
      {
        id: "neural",
        name: "Neural"
      },
      {
        id: "long-form",
        name: "Long-form"
      },
      {
        id: "generative",
        name: "Generative"
      }
    ]
  },
  hasProviderSpecificData: true
};
