ChangedUrl: ({ route }) =>
  PriceSliderBinding.informRangeChanged({
    min: route.minPrice,
    max: route.maxPrice,
  })(model)
