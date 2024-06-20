/**
 * Test the arbitrary strength of a password and output a score.
 *
 * @param input - The password to test.
 * @returns number - The score from 0=terrible to 5.0=strong.
 */
export function testStrength(input) {
  let score = 0

  if (!input)
    return score

  // Letters, numbers, mixed case
  const hasLetters = /[a-z]/i.test(input)
  const hasNumbers = /\d/.test(input)
  const hasBothCases = /[a-z]/.test(input) && /[A-Z]/.test(input)

  if (hasLetters && hasNumbers)
    score += 0.5

  if (hasBothCases)
    score += 0.5

  // Length of password
  if (input.length > 20)
    score += 1.5
  else if (input.length > 15)
    score += 1.25
  else if (input.length > 11)
    score += 1
  else if (input.length > 7)
    score += 0.5
  else if (input.length > 3)
    score += 0.25

  const hasSpecial = /[^a-z0-9]/i.test(input)
  if (hasSpecial)
    score += 0.5

  // has more than just: - _ + .
  const hasReallySpecial = /[^\w\-+.]/.test(input)
  if (hasReallySpecial)
    score += 1

  // If the password does not have any letters, return the current score.
  if (!hasLetters)
    return score

  let doesNotRepeat = true
  for (let i = 1; i < input.length; i++) {
    if (input[i] === input[i - 1]) {
      doesNotRepeat = false
      break
    }
  }

  if (doesNotRepeat)
    score += 0.5

  // Two in a row should not repeat.
  // Only eligible for non-super-short passwords.
  let isNotPatterned = true
  let last2 = ''
  let next2 = ''

  if (input.length > 7) {
    for (let i = 2; i < input.length; i++) {
      last2 = input.slice(i - 2, i)
      next2 = input.slice(i, i + 2)

      if (last2 === next2) {
        isNotPatterned = false
        break
      }
    }

    if (isNotPatterned)
      score += 0.5
  }

  return score
}
