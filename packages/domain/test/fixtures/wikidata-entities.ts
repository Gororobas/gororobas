/**
 * Real Wikidata responses (`wbgetentities`, fetched 2026-11-10), trimmed to the statements the
 * vocabulary prototype maps, without references: Silent Spring (Q591623), tomato (Q23501), Rachel
 * Carson (Q100948), Cerrado (Q278512) and Alto Paraíso de Goiás (Q22060523). Raw provider JSON,
 * decoded by the tests like a response would be.
 */
export const wikidataEntities = {
  Q591623: {
    id: "Q591623",
    type: "item",
    labels: {
      en: {
        language: "en",
        value: "Silent Spring",
      },
      es: {
        language: "es",
        value: "Primavera silenciosa",
      },
      pt: {
        language: "pt",
        value: "Silent Spring",
      },
    },
    aliases: {},
    claims: {
      P31: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "56d2ce980dfb7e5844c4c8777065c37181767334",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 47461344,
                id: "Q47461344",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "q591623$AB2A5884-E2FA-450B-9D56-12DB56B35EE2",
          rank: "normal",
        },
      ],
      P50: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P50",
            hash: "07c7e0012c6d29bc33a192a2c5fb56b852f2940f",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 100948,
                id: "Q100948",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "q591623$1ABDBF69-FDA5-48EE-99A4-0821C6152A1B",
          rank: "normal",
        },
      ],
      P123: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P123",
            hash: "77468a125badf551e3b2263fc965b6a4309d0ddc",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 390074,
                id: "Q390074",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "q591623$AF1B11AD-8DE8-4D89-A03E-5E2BACAED71B",
          rank: "normal",
        },
      ],
      P577: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P577",
            hash: "6bee49b22b833b0ba0763a9e78c58242e962cd41",
            datavalue: {
              value: {
                time: "+1962-09-27T00:00:00Z",
                timezone: 0,
                before: 0,
                after: 0,
                precision: 11,
                calendarmodel: "http://www.wikidata.org/entity/Q1985727",
              },
              type: "time",
            },
            datatype: "time",
          },
          type: "statement",
          id: "Q591623$C96D50BD-F031-4E97-82F3-EF040C5D8946",
          rank: "normal",
        },
      ],
      P407: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P407",
            hash: "92569fc163bb841d6f408130e2ad26cd58ec71e3",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 7976,
                id: "Q7976",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q591623$0939C0B2-4A98-4E28-9A54-3D9B2AD5B016",
          rank: "normal",
        },
      ],
      P495: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P495",
            hash: "7f985e15819b74ed189d022e004890e66d2ae42e",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 30,
                id: "Q30",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q591623$97E3D1E6-6801-4AE8-A849-DA81182155F1",
          rank: "normal",
        },
      ],
      P18: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "6cd7b94de99a9034558d4d725a6b6e7b5eae67fe",
            datavalue: {
              value: "Udaberri isila.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          qualifiers: {
            P407: [
              {
                snaktype: "value",
                property: "P407",
                hash: "e456045320af7ea33ef2bf6c92e3f5e23c50c129",
                datavalue: {
                  value: {
                    "entity-type": "item",
                    "numeric-id": 8752,
                    id: "Q8752",
                  },
                  type: "wikibase-entityid",
                },
                datatype: "wikibase-item",
              },
            ],
          },
          "qualifiers-order": ["P407"],
          id: "Q591623$DE113DC9-0427-4D4E-A126-694ABF6A3C03",
          rank: "normal",
        },
      ],
      P136: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P136",
            hash: "22fdbd4bdd2aaa17e0a4cae00f9d843f741ddcfb",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 35760,
                id: "Q35760",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q591623$E9C0B0AF-B8E1-4473-BB85-51FBABF7FE2B",
          rank: "normal",
        },
      ],
    },
    sitelinks: {
      enwiki: {
        site: "enwiki",
        title: "Silent Spring",
        badges: [],
        url: "https://en.wikipedia.org/wiki/Silent_Spring",
      },
      eswiki: {
        site: "eswiki",
        title: "Primavera silenciosa",
        badges: [],
        url: "https://es.wikipedia.org/wiki/Primavera_silenciosa",
      },
      ptwiki: {
        site: "ptwiki",
        title: "Silent Spring",
        badges: [],
        url: "https://pt.wikipedia.org/wiki/Silent_Spring",
      },
    },
  },
  Q23501: {
    id: "Q23501",
    type: "item",
    labels: {
      es: {
        language: "es",
        value: "Solanum lycopersicum",
      },
      pt: {
        language: "pt",
        value: "tomateiro",
      },
      en: {
        language: "en",
        value: "tomato",
      },
      mul: {
        language: "mul",
        value: "Solanum lycopersicum",
      },
    },
    aliases: {
      es: [
        {
          language: "es",
          value: "tomatera",
        },
      ],
      pt: [
        {
          language: "pt",
          value: "tomate",
        },
      ],
      en: [
        {
          language: "en",
          value: "garden tomato",
        },
        {
          language: "en",
          value: "love apple",
        },
        {
          language: "en",
          value: "tomato plant",
        },
      ],
      mul: [
        {
          language: "mul",
          value: "Lycopersicon esculentum",
        },
        {
          language: "mul",
          value: "Lycopersicon lycopersicum",
        },
      ],
    },
    claims: {
      P105: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P105",
            hash: "aebf3611b23ed90c7c0fc80f6cd1cb7be110ea59",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 7432,
                id: "Q7432",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "q23501$49CF8BA1-16D6-42C1-993F-B0B41F39F981",
          rank: "normal",
        },
      ],
      P171: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P171",
            hash: "20f064907de64736e63766086172f7aed9fd0372",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 146555,
                id: "Q146555",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "q23501$5E1D654B-6720-4912-B516-9050C7718B84",
          rank: "normal",
        },
      ],
      P225: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P225",
            hash: "f2ebabf9a5ea4a7e7c2cf8c4f0c5fd4f0d78a13c",
            datavalue: {
              value: "Solanum lycopersicum",
              type: "string",
            },
            datatype: "string",
          },
          type: "statement",
          qualifiers: {
            P405: [
              {
                snaktype: "value",
                property: "P405",
                hash: "a817d3670bc2f9a3586b6377a65d54fff72ef888",
                datavalue: {
                  value: {
                    "entity-type": "item",
                    "numeric-id": 1043,
                    id: "Q1043",
                  },
                  type: "wikibase-entityid",
                },
                datatype: "wikibase-item",
              },
            ],
            P574: [
              {
                snaktype: "value",
                property: "P574",
                hash: "45e5b04c2f47c968d719101fed54a982f5fde7cf",
                datavalue: {
                  value: {
                    time: "+1753-01-01T00:00:00Z",
                    timezone: 0,
                    before: 0,
                    after: 0,
                    precision: 9,
                    calendarmodel: "http://www.wikidata.org/entity/Q1985727",
                  },
                  type: "time",
                },
                datatype: "time",
              },
            ],
          },
          "qualifiers-order": ["P405", "P574"],
          id: "q23501$33A33E81-2F0D-4940-9945-471E7380D748",
          rank: "normal",
        },
      ],
      P18: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "1ddebbb3f2672658c64b7974e3a2ae0e5d466fe8",
            datavalue: {
              value: "Pomodorini sulla pianta.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          id: "q23501$A560C8E8-C6A9-4786-8CED-568B1C10679B",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "89050b86c44803397d0ff2b3298f08ccb3d4e883",
            datavalue: {
              value: "Rajče1.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          qualifiers: {
            P2096: [
              {
                snaktype: "value",
                property: "P2096",
                hash: "fbea7fc6819b72432949262046adc6ff3a0212ac",
                datavalue: {
                  value: {
                    text: "tomatera",
                    language: "es",
                  },
                  type: "monolingualtext",
                },
                datatype: "monolingualtext",
              },
            ],
          },
          "qualifiers-order": ["P2096"],
          id: "Q23501$af371af1-46cb-3815-504a-2f211bf4454d",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "229e7cd6c4f38cb39451724632413d087005f8d1",
            datavalue: {
              value: "Bright red tomato and cross section02.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          id: "Q23501$18255be7-4ee3-d911-5c5c-9c3b7ec25d0b",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "9dfdfbff6fc7bcf2c46f8d4f57c73ffa302eb9b0",
            datavalue: {
              value: "European tomates from Ivory Coast 01.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          qualifiers: {
            P2096: [
              {
                snaktype: "value",
                property: "P2096",
                hash: "a30fc9881bb2c87927cf959f3e0063111e6860e9",
                datavalue: {
                  value: {
                    text: "Tomates de Côte d'Ivoire",
                    language: "fr",
                  },
                  type: "monolingualtext",
                },
                datatype: "monolingualtext",
              },
            ],
          },
          "qualifiers-order": ["P2096"],
          id: "Q23501$4413f10d-4aee-76ab-559e-7b8448fcc63c",
          rank: "normal",
        },
      ],
      P31: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "06629d890d7ab0ff85c403d8aadf57ce9809c01f",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 16521,
                id: "Q16521",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q23501$95360261-D364-4179-8D83-4380BC0D7AEB",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "12e68bd0e38c4e74aee261c09b2dc343536d937d",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 31839438,
                id: "Q31839438",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q23501$ff81427a-44cb-ec20-58fe-592d78554109",
          rank: "normal",
        },
      ],
      P846: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P846",
            hash: "9249eb81549d146a5397c6b691ee73179ea128e8",
            datavalue: {
              value: "2930137",
              type: "string",
            },
            datatype: "external-id",
          },
          type: "statement",
          id: "Q23501$CC2B0DA3-55EC-4DD9-9698-09CC134875FA",
          rank: "normal",
        },
      ],
      P1843: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P1843",
            hash: "159c2302d618eaf0a1ee08292d9539d1d6ff68ac",
            datavalue: {
              value: {
                text: "garden tomato",
                language: "en",
              },
              type: "monolingualtext",
            },
            datatype: "monolingualtext",
          },
          type: "statement",
          id: "Q23501$13D1DAD3-947A-46C3-9808-2817D4761328",
          rank: "normal",
        },
      ],
      P9714: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P9714",
            hash: "b1cbf84c440e0d22bf1344fed09b73cc821cdbde",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 148,
                id: "Q148",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          qualifiers: {
            P131: [
              {
                snaktype: "value",
                property: "P131",
                hash: "d7c250802e8a59f9dc19bb4aef5fc0bdd60c5cad",
                datavalue: {
                  value: {
                    "entity-type": "item",
                    "numeric-id": 956,
                    id: "Q956",
                  },
                  type: "wikibase-entityid",
                },
                datatype: "wikibase-item",
              },
            ],
          },
          "qualifiers-order": ["P131"],
          id: "Q23501$EB051A2C-15E5-47C4-A9FE-570A9E4E9E5F",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P9714",
            hash: "f3566c6bef211b5d2405ef3e9f4a9476c4f37008",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 17269,
                id: "Q17269",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q23501$711E6070-1374-4E65-879B-E5B4C2646982",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P9714",
            hash: "cb48c5a61b8b46d62f4318551f435192b3d05082",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 15175,
                id: "Q15175",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q23501$9D2FB810-6D64-4EB7-837B-D93E960D15F8",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P9714",
            hash: "23daec18512a4772db0c6e5c9b03d830590089a1",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 1000,
                id: "Q1000",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q23501$79862E65-3072-479E-9C18-47182C0419C2",
          rank: "normal",
        },
      ],
    },
    sitelinks: {
      enwiki: {
        site: "enwiki",
        title: "Tomato",
        badges: ["Q17437798"],
        url: "https://en.wikipedia.org/wiki/Tomato",
      },
      eswiki: {
        site: "eswiki",
        title: "Solanum lycopersicum",
        badges: ["Q17437798"],
        url: "https://es.wikipedia.org/wiki/Solanum_lycopersicum",
      },
      ptwiki: {
        site: "ptwiki",
        title: "Tomate",
        badges: [],
        url: "https://pt.wikipedia.org/wiki/Tomate",
      },
    },
  },
  Q100948: {
    id: "Q100948",
    type: "item",
    labels: {
      es: {
        language: "es",
        value: "Rachel Carson",
      },
      pt: {
        language: "pt",
        value: "Rachel Carson",
      },
      en: {
        language: "en",
        value: "Rachel Carson",
      },
      mul: {
        language: "mul",
        value: "Rachel Carson",
      },
    },
    aliases: {
      es: [
        {
          language: "es",
          value: "Rachel Louise Carson",
        },
      ],
      en: [
        {
          language: "en",
          value: "Rachel Louise Carson",
        },
        {
          language: "en",
          value: "Rachel L. Carson",
        },
      ],
      pt: [
        {
          language: "pt",
          value: "Rachel Louise Carson",
        },
      ],
    },
    claims: {
      P569: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P569",
            hash: "9cd4c145f0dcc1fd74973af291e38858803b15bc",
            datavalue: {
              value: {
                time: "+1907-05-27T00:00:00Z",
                timezone: 0,
                before: 0,
                after: 0,
                precision: 11,
                calendarmodel: "http://www.wikidata.org/entity/Q1985727",
              },
              type: "time",
            },
            datatype: "time",
          },
          type: "statement",
          id: "q100948$C020819A-6F11-469B-B978-1B2381EBAEC1",
          rank: "preferred",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P569",
            hash: "738e59df050a3e8a5a3711eb95b789087151948a",
            datavalue: {
              value: {
                time: "+1907-00-00T00:00:00Z",
                timezone: 0,
                before: 0,
                after: 0,
                precision: 9,
                calendarmodel: "http://www.wikidata.org/entity/Q1985727",
              },
              type: "time",
            },
            datatype: "time",
          },
          type: "statement",
          id: "Q100948$7F7CFDAF-D31B-4B45-91C8-70018CC34E4E",
          rank: "normal",
        },
      ],
      P570: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P570",
            hash: "724338f107691975eb9121b4ca31e366bfbb7441",
            datavalue: {
              value: {
                time: "+1964-04-14T00:00:00Z",
                timezone: 0,
                before: 0,
                after: 0,
                precision: 11,
                calendarmodel: "http://www.wikidata.org/entity/Q1985727",
              },
              type: "time",
            },
            datatype: "time",
          },
          type: "statement",
          id: "q100948$14385CFA-A9A8-4EB3-B68B-943FDEAC4B69",
          rank: "preferred",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P570",
            hash: "40a03bda5da95fde2fa3f4673e442c454db59481",
            datavalue: {
              value: {
                time: "+1964-00-00T00:00:00Z",
                timezone: 0,
                before: 0,
                after: 0,
                precision: 9,
                calendarmodel: "http://www.wikidata.org/entity/Q1985727",
              },
              type: "time",
            },
            datatype: "time",
          },
          type: "statement",
          id: "Q100948$348FDE41-98C1-4935-9DCF-CD171331AA8D",
          rank: "normal",
        },
      ],
      P106: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "1c95bb8b80b604bb974852779e1f171a2283d07a",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 3640160,
                id: "Q3640160",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$f86447e5-4efe-1c38-a5f9-20ffc74eab79",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "62cd69078407a8d5848450bad79c6f2108219c2a",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 3578589,
                id: "Q3578589",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$a1c03949-4920-be4a-964f-bbda29d30394",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "335da27f99397e6dc3ee774a0c6da4ffbc73713c",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 350979,
                id: "Q350979",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$e875381c-4f28-d1dd-7933-e4a73db0db15",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "052171d1474ffab5d0476f919ee991ff4586ea8b",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 11774202,
                id: "Q11774202",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$4AE0B85A-A7D4-479D-98C4-0C6558252D41",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "3227da5c561faf242d77dcff2b2ceb6cb4ffa61c",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 482980,
                id: "Q482980",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$1E024AA2-9C9B-4E08-84DD-57E482DABC11",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "99669818eb708f850bf5e1c2b979a06393f762c0",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 16060693,
                id: "Q16060693",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$42bb6825-4caa-6285-994c-e1c20924d78f",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "6957dad0ca642c9c7d60466ce32be533870158ee",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 15980158,
                id: "Q15980158",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$331E72F4-1E45-4351-9699-99932B70B617",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "70541c2eb72d85fa5f74008b4ee33b004a1ff7eb",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 36180,
                id: "Q36180",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$341A6E95-A988-4B61-82DF-EFBF68591932",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "5f2bfcba8fd33ea0a464be42e9d1dedebcd0e868",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 26102,
                id: "Q26102",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$e0e37dee-4944-a267-934f-53e78dfafdf6",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "459a1412c7cf0fe0b2a3109919e2740366f3fa78",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 15839134,
                id: "Q15839134",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$7AD94FE2-CFAF-433F-BE84-42EFCAA4005A",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "b763c3996eac987df292667c49f62e80bc7597db",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 17433421,
                id: "Q17433421",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$AE21960E-D8ED-4F4B-89C9-3659AABB1E92",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P106",
            hash: "7568a19123ca4c38f800b10685a969d778f98ae0",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 864503,
                id: "Q864503",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$6AAC7079-0C6B-4DBC-AF26-A177207CC7EE",
          rank: "normal",
        },
      ],
      P31: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "ad7d38a03cdd40cdc373de0dc4e7b7fcbccb31d9",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 5,
                id: "Q5",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q100948$F8E4E224-7029-4925-AD83-DB4A0262F109",
          rank: "normal",
        },
      ],
      P18: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "e4d751007ba4a09f5e356834ae4cf5cc7fafd6d7",
            datavalue: {
              value: "Rachel-Carson.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          qualifiers: {
            P2096: [
              {
                snaktype: "value",
                property: "P2096",
                hash: "a5ac584f35fd7fd2e38cbcdee31fc1d13ecbcd19",
                datavalue: {
                  value: {
                    text: "Rachel Carson en 1944.",
                    language: "fr",
                  },
                  type: "monolingualtext",
                },
                datatype: "monolingualtext",
              },
            ],
          },
          "qualifiers-order": ["P2096"],
          id: "Q100948$433BDA2D-7BDA-4ED8-97C2-6A6B7BF3E1A0",
          rank: "normal",
        },
      ],
      P551: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P551",
            hash: "de12813ebbc75a6f85ccac7500bbbabaed415229",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 755741,
                id: "Q755741",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          qualifiers: {
            P582: [
              {
                snaktype: "value",
                property: "P582",
                hash: "171b3794a4831fbfe090f29bc027e66fd95b41bf",
                datavalue: {
                  value: {
                    time: "+1964-04-14T00:00:00Z",
                    timezone: 0,
                    before: 0,
                    after: 0,
                    precision: 11,
                    calendarmodel: "http://www.wikidata.org/entity/Q1985727",
                  },
                  type: "time",
                },
                datatype: "time",
              },
            ],
            P580: [
              {
                snaktype: "value",
                property: "P580",
                hash: "c786a8b39f62b37eb45745acf99302b5409f2e26",
                datavalue: {
                  value: {
                    time: "+1957-00-00T00:00:00Z",
                    timezone: 0,
                    before: 0,
                    after: 0,
                    precision: 9,
                    calendarmodel: "http://www.wikidata.org/entity/Q1985727",
                  },
                  type: "time",
                },
                datatype: "time",
              },
            ],
          },
          "qualifiers-order": ["P582", "P580"],
          id: "Q100948$7639603C-4180-4163-A559-433748F5E433",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P551",
            hash: "e9513e2846bbef46312e3477ec38b28e9dc696de",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 7279188,
                id: "Q7279188",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          qualifiers: {
            P580: [
              {
                snaktype: "value",
                property: "P580",
                hash: "66ae349dc33f9eca44054d3a9fc10a1ff9c23cbe",
                datavalue: {
                  value: {
                    time: "+1956-00-00T00:00:00Z",
                    timezone: 0,
                    before: 0,
                    after: 0,
                    precision: 9,
                    calendarmodel: "http://www.wikidata.org/entity/Q1985727",
                  },
                  type: "time",
                },
                datatype: "time",
              },
            ],
            P582: [
              {
                snaktype: "value",
                property: "P582",
                hash: "171b3794a4831fbfe090f29bc027e66fd95b41bf",
                datavalue: {
                  value: {
                    time: "+1964-04-14T00:00:00Z",
                    timezone: 0,
                    before: 0,
                    after: 0,
                    precision: 11,
                    calendarmodel: "http://www.wikidata.org/entity/Q1985727",
                  },
                  type: "time",
                },
                datatype: "time",
              },
            ],
          },
          "qualifiers-order": ["P580", "P582"],
          id: "Q100948$a7e2b637-4615-0588-f92f-cfd186096f85",
          rank: "normal",
        },
      ],
      P856: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P856",
            hash: "5f27fb682b10a14b7cb9510c46f0147df4c9045a",
            datavalue: {
              value: "http://www.rachelcarson.org",
              type: "string",
            },
            datatype: "url",
          },
          type: "statement",
          qualifiers: {
            P407: [
              {
                snaktype: "value",
                property: "P407",
                hash: "daf1c4fcb58181b02dff9cc89deb084004ddae4b",
                datavalue: {
                  value: {
                    "entity-type": "item",
                    "numeric-id": 1860,
                    id: "Q1860",
                  },
                  type: "wikibase-entityid",
                },
                datatype: "wikibase-item",
              },
            ],
            P582: [
              {
                snaktype: "somevalue",
                property: "P582",
                hash: "0f0e43d5ac17613a0369bf0d65a07a326f4b8d98",
                datatype: "time",
              },
            ],
            P1065: [
              {
                snaktype: "value",
                property: "P1065",
                hash: "1919b656b0317a72f392a7496ecf985aac653cd1",
                datavalue: {
                  value: "https://web.archive.org/web/20101231145614/http://www.rachelcarson.org/",
                  type: "string",
                },
                datatype: "url",
              },
            ],
          },
          "qualifiers-order": ["P407", "P582", "P1065"],
          id: "Q100948$3b32a7f1-420d-4c94-05d5-d4503d5b146d",
          rank: "normal",
        },
      ],
    },
    sitelinks: {
      enwiki: {
        site: "enwiki",
        title: "Rachel Carson",
        badges: ["Q17437796"],
        url: "https://en.wikipedia.org/wiki/Rachel_Carson",
      },
      eswiki: {
        site: "eswiki",
        title: "Rachel Carson",
        badges: [],
        url: "https://es.wikipedia.org/wiki/Rachel_Carson",
      },
      ptwiki: {
        site: "ptwiki",
        title: "Rachel Carson",
        badges: [],
        url: "https://pt.wikipedia.org/wiki/Rachel_Carson",
      },
    },
  },
  Q278512: {
    id: "Q278512",
    type: "item",
    labels: {
      en: {
        language: "en",
        value: "Cerrado",
      },
      es: {
        language: "es",
        value: "ecorregión del Cerrado",
      },
      pt: {
        language: "pt",
        value: "Cerrado",
      },
    },
    aliases: {
      es: [
        {
          language: "es",
          value:
            "Zonas protegidas del Cerrado – Parques nacionales de Chapada dos Veadeiros y las Emas",
        },
        {
          language: "es",
          value: "Ecorregion del Cerrado",
        },
        {
          language: "es",
          value: "El Cerrado",
        },
        {
          language: "es",
          value: "Sabana del Cerrado",
        },
      ],
    },
    claims: {
      P18: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "ed528fcc6c35060762f546dbcb967744efeae76e",
            datavalue: {
              value: "Cerrado ecoregion.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          id: "q278512$0F645460-21DE-4F83-BE81-20CC43998C95",
          rank: "normal",
        },
      ],
      P31: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "7e4d6cd07eeeffd5f84861169efa2df676139431",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 42320,
                id: "Q42320",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$c305fab6-4a7f-0385-b4c8-3164cf2b079f",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "ed3eca58cdbfbe698c5e14733bfa9a0fe2a9ee30",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 6617741,
                id: "Q6617741",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$6e1ae602-42b7-47fc-5601-9f9bc756512d",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "0259d5ff7ac1c074b699be480bb8f642f47655da",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 10327255,
                id: "Q10327255",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$2420517f-4d6b-c220-1cbb-260ba1942881",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "4ed0aa3579598f282a17233ece39d9d837e91d06",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 386426,
                id: "Q386426",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$75423301-4be3-84f6-0572-e810075874af",
          rank: "normal",
        },
      ],
      P131: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "2af59cf8fa458fc78c26ad7928ad74826884bf25",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 39109,
                id: "Q39109",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$d6e23a1e-4bdb-0fdc-d532-489646996088",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "a09d2228a58b9d4f0ff94eadf7c959b6f8c15e0e",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 42824,
                id: "Q42824",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$48d1948b-4430-475d-70cf-55951391388a",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "580039b6d7624d37cccfaaf0e7b00529f02b917b",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 43319,
                id: "Q43319",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$aa38430d-418f-53f9-1a97-1a3edb21feba",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "d64a493327c531b7cce6d9ebf74b9ee823d976cc",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 41587,
                id: "Q41587",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$00d2592a-4854-a728-1ba1-8b6b06e10224",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "c4d8fbdea38c19546322ed8c3d32f1c62f2fe2d5",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 43695,
                id: "Q43695",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$cdd168bb-4817-46c8-cfb3-8ffb5a87f1c5",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "2f05178c35c7aa644e30898aba8d7df0b9aaaed4",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 40430,
                id: "Q40430",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$3e66b93a-4a16-0491-528b-053a605e47bf",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "4ba1029e6fbb301220f5e7d5fcfc2d0e6dea5a23",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 42362,
                id: "Q42362",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$c4d14097-42de-d1db-8ab8-018def3226a0",
          rank: "normal",
        },
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "55a1cea09726489c371e239c8da335e171012171",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 119158,
                id: "Q119158",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q278512$d48dc823-4a65-f1c8-0cba-8f4c927964e3",
          rank: "normal",
        },
      ],
    },
    sitelinks: {
      enwiki: {
        site: "enwiki",
        title: "Cerrado",
        badges: [],
        url: "https://en.wikipedia.org/wiki/Cerrado",
      },
      eswiki: {
        site: "eswiki",
        title: "Ecorregión del Cerrado",
        badges: [],
        url: "https://es.wikipedia.org/wiki/Ecorregi%C3%B3n_del_Cerrado",
      },
      ptwiki: {
        site: "ptwiki",
        title: "Cerrado",
        badges: [],
        url: "https://pt.wikipedia.org/wiki/Cerrado",
      },
    },
  },
  Q22060523: {
    id: "Q22060523",
    type: "item",
    labels: {
      en: {
        language: "en",
        value: "Alto Paraíso de Goiás",
      },
      pt: {
        language: "pt",
        value: "Alto Paraíso de Goiás",
      },
      es: {
        language: "es",
        value: "Alto Paraíso de Goiás",
      },
    },
    aliases: {
      pt: [
        {
          language: "pt",
          value: "Alto paraíso de goiás",
        },
      ],
      es: [
        {
          language: "es",
          value: "Alto Paraiso de Goias",
        },
      ],
      en: [
        {
          language: "en",
          value: "Alto Paraiso de Goias",
        },
      ],
    },
    claims: {
      P1566: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P1566",
            hash: "7a2d9fb5be78c244845432b07e269a3539797163",
            datavalue: {
              value: "6319149",
              type: "string",
            },
            datatype: "external-id",
          },
          type: "statement",
          id: "Q22060523$17C5B9CC-2144-41A8-8A08-801D5A961872",
          rank: "normal",
        },
      ],
      P31: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P31",
            hash: "64451778649ababeb1433bba2b9dbc5079680041",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 3184121,
                id: "Q3184121",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q22060523$26D0681A-CA1A-4F8A-B0A8-8ECA525AA46E",
          rank: "normal",
        },
      ],
      P131: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P131",
            hash: "d64a493327c531b7cce6d9ebf74b9ee823d976cc",
            datavalue: {
              value: {
                "entity-type": "item",
                "numeric-id": 41587,
                id: "Q41587",
              },
              type: "wikibase-entityid",
            },
            datatype: "wikibase-item",
          },
          type: "statement",
          id: "Q22060523$ABCCD3B8-16EA-4D47-9E54-B72A486A4E57",
          rank: "normal",
        },
      ],
      P18: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P18",
            hash: "1748a5da1a29dfc2cd91b5eecf6a76e9fbc4beaf",
            datavalue: {
              value: "Nuvens 2.jpg",
              type: "string",
            },
            datatype: "commonsMedia",
          },
          type: "statement",
          id: "Q22060523$967919FF-F27F-4CC9-A501-14D5C26E2C3E",
          rank: "normal",
        },
      ],
      P6766: [
        {
          mainsnak: {
            snaktype: "value",
            property: "P6766",
            hash: "9c0e45554b1655b6b68122bc44644d0bc4fdf2a6",
            datavalue: {
              value: "101962709",
              type: "string",
            },
            datatype: "external-id",
          },
          type: "statement",
          id: "Q22060523$5959BACF-CCF3-4BED-BD46-061B4568AE89",
          rank: "normal",
        },
      ],
    },
    sitelinks: {
      enwiki: {
        site: "enwiki",
        title: "Alto Paraíso de Goiás",
        badges: [],
        url: "https://en.wikipedia.org/wiki/Alto_Para%C3%ADso_de_Goi%C3%A1s",
      },
      eswiki: {
        site: "eswiki",
        title: "Alto Paraíso de Goiás",
        badges: [],
        url: "https://es.wikipedia.org/wiki/Alto_Para%C3%ADso_de_Goi%C3%A1s",
      },
      ptwiki: {
        site: "ptwiki",
        title: "Alto Paraíso de Goiás",
        badges: [],
        url: "https://pt.wikipedia.org/wiki/Alto_Para%C3%ADso_de_Goi%C3%A1s",
      },
    },
  },
}

/** Labels and IETF tags (P305) of the items those statements point at, as the prefetch loads them. */
export const wikidataReferencedItems = {
  Q1000: {
    labels: {
      en: "Gabon",
      pt: "Gabão",
    },
    languageTag: null,
  },
  Q100948: {
    labels: {
      pt: "Rachel Carson",
      en: "Rachel Carson",
    },
    languageTag: null,
  },
  Q10327255: {
    labels: {
      pt: "Mata seca",
    },
    languageTag: null,
  },
  Q11774202: {
    labels: {
      en: "essayist",
      pt: "ensaísta",
    },
    languageTag: null,
  },
  Q119158: {
    labels: {
      pt: "Distrito Federal",
      en: "Federal District",
    },
    languageTag: null,
  },
  Q146555: {
    labels: {
      en: "Solanum",
    },
    languageTag: null,
  },
  Q148: {
    labels: {
      en: "People's Republic of China",
      pt: "China",
    },
    languageTag: null,
  },
  Q15175: {
    labels: {
      en: "Guangdong",
      pt: "Cantão",
    },
    languageTag: null,
  },
  Q15839134: {
    labels: {
      en: "ecologist",
      pt: "ecologista",
    },
    languageTag: null,
  },
  Q15980158: {
    labels: {
      en: "non-fiction writer",
      pt: "escritor de não ficção",
    },
    languageTag: null,
  },
  Q16060693: {
    labels: {
      en: "conservationist",
      pt: "conservacionista",
    },
    languageTag: null,
  },
  Q16521: {
    labels: {
      en: "taxon",
      pt: "táxon",
    },
    languageTag: null,
  },
  Q17269: {
    labels: {
      pt: "Região Autónoma do Tibete",
      en: "Tibet Autonomous Region",
    },
    languageTag: null,
  },
  Q17433421: {
    labels: {
      en: "science journalist",
      pt: "jornalista científico",
    },
    languageTag: null,
  },
  Q26102: {
    labels: {
      pt: "delator",
      en: "whistleblower",
    },
    languageTag: null,
  },
  Q30: {
    labels: {
      pt: "Estados Unidos",
      en: "United States",
    },
    languageTag: null,
  },
  Q31839438: {
    labels: {
      en: "food crop",
    },
    languageTag: null,
  },
  Q3184121: {
    labels: {
      pt: "município do Brasil",
      en: "municipality of Brazil",
    },
    languageTag: null,
  },
  Q350979: {
    labels: {
      en: "zoologist",
      pt: "zoólogo",
    },
    languageTag: null,
  },
  Q35760: {
    labels: {
      pt: "ensaio",
      en: "essay",
    },
    languageTag: null,
  },
  Q3578589: {
    labels: {
      en: "environmentalist",
      pt: "ambientalista",
    },
    languageTag: null,
  },
  Q36180: {
    labels: {
      pt: "escritor",
      en: "writer",
    },
    languageTag: null,
  },
  Q3640160: {
    labels: {
      en: "marine biologist",
      pt: "biólogo marinho",
    },
    languageTag: null,
  },
  Q386426: {
    labels: {
      en: "natural heritage",
      pt: "património natural",
    },
    languageTag: null,
  },
  Q390074: {
    labels: {
      en: "Houghton Mifflin Harcourt",
      pt: "Houghton Mifflin Harcourt",
    },
    languageTag: null,
  },
  Q39109: {
    labels: {
      pt: "Minas Gerais",
      en: "Minas Gerais",
    },
    languageTag: null,
  },
  Q40430: {
    labels: {
      pt: "Bahia",
      en: "Bahia",
    },
    languageTag: null,
  },
  Q41587: {
    labels: {
      pt: "Goiás",
      en: "Goiás",
    },
    languageTag: null,
  },
  Q42320: {
    labels: {
      pt: "savana",
      en: "savanna",
    },
    languageTag: null,
  },
  Q42362: {
    labels: {
      pt: "Maranhão",
      en: "Maranhão",
    },
    languageTag: null,
  },
  Q42824: {
    labels: {
      pt: "Mato Grosso",
      en: "Mato Grosso",
    },
    languageTag: null,
  },
  Q43319: {
    labels: {
      pt: "Mato Grosso do Sul",
      en: "Mato Grosso do Sul",
    },
    languageTag: null,
  },
  Q43695: {
    labels: {
      pt: "Tocantins",
    },
    languageTag: null,
  },
  Q47461344: {
    labels: {
      en: "written work",
      pt: "obra escrita",
    },
    languageTag: null,
  },
  Q482980: {
    labels: {
      pt: "autor",
      en: "author",
    },
    languageTag: null,
  },
  Q5: {
    labels: {
      en: "human",
      pt: "humano",
    },
    languageTag: null,
  },
  Q6617741: {
    labels: {
      en: "WWF ecoregion",
      pt: "ecorregião da WWF",
    },
    languageTag: null,
  },
  Q7279188: {
    labels: {
      en: "Rachel Carson House",
    },
    languageTag: null,
  },
  Q7432: {
    labels: {
      en: "species",
      pt: "espécie",
    },
    languageTag: null,
  },
  Q755741: {
    labels: {
      pt: "Silver Spring",
      en: "Silver Spring",
    },
    languageTag: null,
  },
  Q7976: {
    labels: {
      pt: "inglês americano",
      en: "American English",
    },
    languageTag: "en-US",
  },
  Q864503: {
    labels: {
      en: "biologist",
      pt: "biólogo",
    },
    languageTag: null,
  },
}
