export default {
  id: "topaz",
  alias: "topaz",
  display: {
    name: "Topaz",
    icon: "image",
    color: "#059669",
    textIcon: "TP",
    website: "https://topazlabs.com",
    notice: {
      text: "Reference only: no Topaz image adapter or static model is registered. Native billing uses output megapixels per credit (Gigapixel 24, Wonder 4, Bloom 2); credit packages are not a USD/token quote. A dedicated enhancement adapter is required.",
      apiKeyUrl: "https://topazlabs.com/account"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "image"
  ]
};
