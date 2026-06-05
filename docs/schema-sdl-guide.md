# Как составлять GraphQL SDL

GraphQL SDL - это текстовое описание схемы GraphQL. В нем задаются типы, поля, входные структуры, enum-значения и связи между объектами.

## Минимальный пример

```graphql
type Query {
  me: User!
  feed: [Post!]!
}

type User {
  id: ID!
  username: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  author: User!
}
```

В визуализации появятся блоки `Query`, `User` и `Post`.

Связи:

- `Query.me -> User`
- `Query.feed -> Post`
- `User.posts -> Post`
- `Post.author -> User`

## Основные конструкции

### type

`type` описывает объект данных.

```graphql
type Product {
  id: ID!
  title: String!
  price: Float
}
```

В графе `Product` станет отдельным блоком.

### input

`input` описывает входные данные для мутаций или фильтров.

```graphql
input ProductFilterInput {
  query: String
  minPrice: Float
  maxPrice: Float
}
```

### enum

`enum` задает фиксированный набор значений.

```graphql
enum ProductStatus {
  ACTIVE
  DRAFT
  ARCHIVED
}
```

### interface

`interface` задает общий контракт для нескольких типов.

```graphql
interface Node {
  id: ID!
}

type User implements Node {
  id: ID!
  username: String!
}
```

## Как читать типы полей

- `String` - строка.
- `Int` - целое число.
- `Float` - число с плавающей точкой.
- `Boolean` - true или false.
- `ID` - идентификатор.
- `User` - ссылка на тип `User`.
- `User!` - обязательная ссылка на `User`.
- `[User]` - список пользователей.
- `[User!]!` - обязательный список обязательных пользователей.

## Как появляются стрелки

Стрелка появляется, когда поле одного блока ссылается на другой пользовательский тип.

```graphql
type Order {
  id: ID!
  customer: User!
}
```

Поле `customer: User!` создаст стрелку от поля `customer` блока `Order` к блоку `User`.

Скалярные типы обычно не создают сложных связей:

- `String`
- `Int`
- `Float`
- `Boolean`
- `ID`

## Частые ошибки в SDL

- Пропущено двоеточие между именем поля и типом.
- Используются запятые между полями. В SDL они не нужны.
- Тип поля ссылается на объект, который не описан в схеме.
- Лишняя или пропущенная фигурная скобка.
- Название поля начинается с цифры.
