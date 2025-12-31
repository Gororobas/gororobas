-- Create "users" table
CREATE TABLE `users` (
  `name` text NOT NULL,
  `email` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now'))
);
-- Create index "users_email" to table: "users"
CREATE UNIQUE INDEX `users_email` ON `users` (`email`);
-- Create "posts" table
CREATE TABLE `posts` (
  `id` integer NULL,
  `user_id` integer NOT NULL,
  `title` text NOT NULL,
  `body` text NULL,
  `created_at` text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (`id`),
  CONSTRAINT `0` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create index "idx_posts_user_id" to table: "posts"
CREATE INDEX `idx_posts_user_id` ON `posts` (`user_id`);
