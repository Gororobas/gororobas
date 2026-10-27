// ❌ Bad: the binding must be PascalCase and match the declared Command name.
const fetchWeather = WeatherDefinition.makeCommand('FetchWeather', {
  messages: [Message.CompletedFetchWeather],
})

const SaveWeather = WeatherDefinition.makeCommand('FetchWeather', {
  messages: [Message.CompletedFetchWeather],
})

// ✅ Good: the declaration and binding name match.
const FetchWeather = WeatherDefinition.makeCommand('FetchWeather', {
  messages: [Message.CompletedFetchWeather],
})
