DROP INDEX IF EXISTS wiki_article_translations_search;

CREATE INDEX wiki_article_translations_search ON wiki_article_translations USING fts ( searchable_title, searchable_names, searchable_content ) WITH ( tokenizer = 'ngram', min_gram = 3, max_gram = 3, weights = 'searchable_title=8.0,searchable_names=4.0,searchable_content=1.0' );

DROP INDEX IF EXISTS publication_translations_search;

CREATE INDEX publication_translations_search ON publication_translations USING fts (searchable_content) WITH (tokenizer = 'ngram', min_gram = 3, max_gram = 3);

DROP INDEX IF EXISTS profiles_search;

CREATE INDEX profiles_search ON profiles USING fts (searchable_text) WITH (tokenizer = 'ngram', min_gram = 3, max_gram = 3);
