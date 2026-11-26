# Climate profile review

The archive column shows the spike’s published CHELSA 1981–2010 results over each full municipality, rendered by the profile editor. Its daylight estimate comes from the spike’s representative point. Pacho was absent from the archive.

The elevation test column shows the TypeScript aggregator reading controlled GeoTIFFs over the same municipal boundaries. Each run selected terrain at 950–1,050 m around a test elevation of 1,000 m. The numbers in this column are synthetic. Each screenshot includes the monthly charts and expanded data table.

| Municipality | Archived climate normals | Elevation test |
| --- | --- | --- |
| Viçosa | [Archive](archive-vicosa.webp) | [Test](fixture-vicosa.webp) |
| Rio Acima | [Archive](archive-rio-acima.webp) | [Test](fixture-rio-acima.webp) |
| Belo Horizonte | [Archive](archive-belo-horizonte.webp) | [Test](fixture-belo-horizonte.webp) |
| Villa de Leyva | [Archive](archive-villa-de-leyva.webp) | [Test](fixture-villa-de-leyva.webp) |
| Pacho, Cundinamarca | No archived profile | [Test](fixture-pacho.webp) |
| Petrópolis | [Archive](archive-petropolis.webp) | [Test](fixture-petropolis.webp) |

To test a personal elevation with live data, save a municipality and elevation in your profile’s location editor. The server needs access to the CHELSA climatology and Copernicus GLO-90 sources identified in the server README. The editor refreshes the card when generation finishes. The signed-in API returns the same result at `GET /people/me/locations`.
