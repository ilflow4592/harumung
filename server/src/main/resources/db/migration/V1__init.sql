-- 하루멍 초기 스키마. dev-spec 5장과 동일. InnoDB, utf8mb4, 시간은 DATETIME(6) UTC, 기본키 ULID CHAR(26).

create table kindergarten (
  id char(26) primary key,
  name varchar(100) not null,
  owner_phone_enc varbinary(128) not null,
  plan varchar(20) not null default 'TRIAL',
  trial_ends_at datetime(6),
  created_at datetime(6) not null
) engine=InnoDB default charset=utf8mb4;

create table dog (
  id char(26) primary key,
  kindergarten_id char(26) not null,
  name varchar(50) not null,
  sex varchar(10) not null,
  thumbnail_key varchar(255),
  memo text,
  active tinyint(1) not null default 1,
  created_at datetime(6) not null,
  constraint fk_dog_kg foreign key (kindergarten_id) references kindergarten(id),
  constraint ck_dog_sex check (sex in ('MALE','FEMALE')),
  index ix_dog_kg (kindergarten_id, active)
) engine=InnoDB default charset=utf8mb4;

create table guardian_contact (
  id char(26) primary key,
  dog_id char(26) not null,
  phone_enc varbinary(128) not null,
  phone_last4 char(4) not null,
  is_primary tinyint(1) not null default 0,
  constraint fk_contact_dog foreign key (dog_id) references dog(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table shoot_session (
  id char(26) primary key,
  kindergarten_id char(26) not null,
  started_at datetime(6) not null,
  closed_at datetime(6),
  saved_count int,
  deleted_count int,
  constraint fk_session_kg foreign key (kindergarten_id) references kindergarten(id)
) engine=InnoDB default charset=utf8mb4;

create table media (
  id char(26) primary key,
  kindergarten_id char(26) not null,
  session_id char(26),
  kind varchar(10) not null,
  taken_at datetime(6) not null,
  duration_ms int,
  size_bytes bigint,
  original_key varchar(255) not null,
  thumb_key varchar(255) not null,
  content_hash char(64),
  edited_from_id char(26),
  hidden tinyint(1) not null default 0,
  assign_source varchar(20) not null,
  confirmed_at datetime(6),
  expires_at datetime(6) not null,
  constraint fk_media_kg foreign key (kindergarten_id) references kindergarten(id),
  constraint fk_media_session foreign key (session_id) references shoot_session(id),
  constraint fk_media_edited_from foreign key (edited_from_id) references media(id),
  constraint ck_media_kind check (kind in ('PHOTO','VIDEO')),
  constraint ck_media_source check (assign_source in ('MANUAL_SHOT','MANUAL_REVIEW','AUTO')),
  index ix_media_kg_taken (kindergarten_id, taken_at),
  index ix_media_expires (expires_at)
) engine=InnoDB default charset=utf8mb4;

create table media_dog (
  media_id char(26) not null,
  dog_id char(26) not null,
  a_cut tinyint(1) not null default 0,
  primary key (media_id, dog_id),
  constraint fk_md_media foreign key (media_id) references media(id) on delete cascade,
  constraint fk_md_dog foreign key (dog_id) references dog(id) on delete cascade,
  index ix_media_dog_dog (dog_id)
) engine=InnoDB default charset=utf8mb4;

create table album (
  id char(26) primary key,
  dog_id char(26) not null,
  album_date date not null,
  token char(32) not null,
  expires_at datetime(6) not null,
  opened_at datetime(6),
  constraint uq_album_token unique (token),
  constraint uq_album_dog_date unique (dog_id, album_date),
  constraint fk_album_dog foreign key (dog_id) references dog(id)
) engine=InnoDB default charset=utf8mb4;

create table album_media (
  album_id char(26) not null,
  media_id char(26) not null,
  sort_order int not null,
  primary key (album_id, media_id),
  constraint fk_am_album foreign key (album_id) references album(id) on delete cascade,
  constraint fk_am_media foreign key (media_id) references media(id) on delete cascade
) engine=InnoDB default charset=utf8mb4;

create table delivery (
  id char(26) primary key,
  album_id char(26) not null,
  contact_id char(26) not null,
  channel varchar(10) not null,
  sent_at datetime(6) not null,
  result varchar(10) not null,
  error varchar(500),
  constraint fk_delivery_album foreign key (album_id) references album(id),
  constraint fk_delivery_contact foreign key (contact_id) references guardian_contact(id),
  constraint ck_delivery_channel check (channel in ('ALIMTALK','SMS')),
  constraint ck_delivery_result check (result in ('SENT','FAILED'))
) engine=InnoDB default charset=utf8mb4;
